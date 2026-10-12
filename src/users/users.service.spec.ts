import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('hashes password with argon2, trims and lowercases email, and defaults to MEMBER role', async () => {
      prismaMock.user.create.mockImplementation(async ({ data }) => ({
        id: 1,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.create({
        name: '  Alice Smith  ',
        email: '  Alice.Smith@Example.COM  ',
        password: 'plainSecretPassword123',
      });

      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
      const callData = prismaMock.user.create.mock.calls[0][0].data;

      expect(callData.name).toBe('Alice Smith');
      expect(callData.email).toBe('alice.smith@example.com');
      expect(callData.role).toBe(Role.MEMBER);
      expect(callData.passwordHash).not.toBe('plainSecretPassword123');

      // Verify that argon2 can verify the generated hash against the plain password
      const isPasswordValid = await argon2.verify(
        callData.passwordHash,
        'plainSecretPassword123',
      );
      expect(isPasswordValid).toBe(true);

      expect(result.email).toBe('alice.smith@example.com');
    });

    it('creates user with explicit role when specified', async () => {
      prismaMock.user.create.mockImplementation(async ({ data }) => ({
        id: 2,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.create({
        name: 'Librarian Bob',
        email: 'bob@example.com',
        password: 'securePassword456',
        role: Role.LIBRARIAN,
      });

      const callData = prismaMock.user.create.mock.calls[0][0].data;
      expect(callData.role).toBe(Role.LIBRARIAN);
    });
  });

  describe('findByEmail', () => {
    it('queries user with trimmed and lowercased email', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        role: Role.MEMBER,
      });

      const user = await service.findByEmail('  Alice@Example.COM ');

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
      expect(user).toBeDefined();
      expect(user?.email).toBe('alice@example.com');
    });
  });

  describe('findById', () => {
    it('queries user by primary key id', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 10,
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      const user = await service.findById(10);

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      expect(user?.id).toBe(10);
    });
  });

  describe('list', () => {
    it('returns all users ordered by id ascending', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
      ]);

      const users = await service.list();

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        orderBy: { id: 'asc' },
      });
      expect(users).toHaveLength(2);
    });
  });

  describe('updateRole', () => {
    it('updates user role to ADMIN', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 1,
        name: 'Alice',
        role: Role.ADMIN,
      });

      const updated = await service.updateRole(1, Role.ADMIN);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { role: Role.ADMIN },
      });
      expect(updated.role).toBe(Role.ADMIN);
    });
  });
});
