import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    create: jest.Mock;
  };
  let prismaMock: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const mockUser = {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
    passwordHash: '',
    role: Role.MEMBER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    mockUser.passwordHash = await argon2.hash('validPassword123');
  });

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    prismaMock = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 10 }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-access-token'),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
        if (key === 'REFRESH_TOKEN_TTL_DAYS') return 7;
        return defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('creates a user with Role.MEMBER and returns auth tokens', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'validPassword123',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'alice@example.com',
      );
      expect(usersService.create).toHaveBeenCalledWith({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'validPassword123',
        role: Role.MEMBER,
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 1,
        email: 'alice@example.com',
        role: Role.MEMBER,
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual(mockUser);
    });

    it('rejects duplicate email with ConflictException', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'validPassword123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('validates name, email, and password requirements', async () => {
      await expect(
        service.register({
          name: '',
          email: 'alice@example.com',
          password: 'validPassword123',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.register({
          name: 'Alice',
          email: 'invalid-email',
          password: 'validPassword123',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.register({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'short',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'validPassword123',
      });

      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual(mockUser);
    });

    it('throws generic UnauthorizedException on unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'validPassword123',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws generic UnauthorizedException on wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.login({
          email: 'alice@example.com',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });

  describe('refreshTokens', () => {
    it('rotates refresh token: revokes old token and issues new tokens', async () => {
      const rawToken = 'original-refresh-token';
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 101,
        userId: 1,
        tokenHash,
        expiresAt: futureDate,
        revokedAt: null,
        user: mockUser,
      });

      const result = await service.refreshTokens(rawToken);

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(rawToken);
    });

    it('detects reuse and revokes all tokens for user when revoked token is used', async () => {
      const rawToken = 'compromised-revoked-token';
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 102,
        userId: 1,
        tokenHash,
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(Date.now() - 5000),
        user: mockUser,
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws UnauthorizedException if token does not exist or has expired', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('nonexistent-token')).rejects.toThrow(
        UnauthorizedException,
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 103,
        userId: 1,
        tokenHash: 'expired-hash',
        expiresAt: new Date(Date.now() - 10000), // in the past
        revokedAt: null,
        user: mockUser,
      });

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the provided refresh token', async () => {
      const rawToken = 'token-to-revoke';
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 200,
        tokenHash,
        revokedAt: null,
      });

      const result = await service.logout(rawToken);

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 200 },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result).toBe(true);
    });
  });
});
