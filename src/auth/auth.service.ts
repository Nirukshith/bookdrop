import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginInput } from './dto/login.input';
import { RegisterInput } from './dto/register.input';
import { AuthPayloadModel } from './models/auth-payload.model';

// Constant dummy hash to equalize response timing when a requested user email does not exist
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$Nf1iD2kya4Pfy0iixQn7vg$HoxJO/4+PX7iyrHXZojinz3YqwJD+k+lVDyr5b+JfFw';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const rawRefreshToken = this.generateOpaqueToken();

    const refreshDays = this.configService.get<number>(
      'REFRESH_TOKEN_TTL_DAYS',
      7,
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(refreshDays));

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async register(input: RegisterInput): Promise<AuthPayloadModel> {
    const trimmedName = input.name ? input.name.trim() : '';
    if (trimmedName.length === 0) {
      throw new BadRequestException('Name must not be empty');
    }

    const trimmedEmail = input.email ? input.email.trim().toLowerCase() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new BadRequestException('Must be a valid email address');
    }

    if (!input.password || input.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }

    const existingUser = await this.usersService.findByEmail(trimmedEmail);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    // Role is strictly hardcoded to MEMBER to prevent privilege escalation
    const newUser = await this.usersService.create({
      name: trimmedName,
      email: trimmedEmail,
      password: input.password,
      role: Role.MEMBER,
    });

    const tokens = await this.generateTokens(newUser);

    return {
      ...tokens,
      user: newUser,
    };
  }

  async login(input: LoginInput): Promise<AuthPayloadModel> {
    const trimmedEmail = input.email ? input.email.trim().toLowerCase() : '';
    const user = await this.usersService.findByEmail(trimmedEmail);

    if (!user) {
      // Execute dummy password verification to protect against timing attacks
      await argon2.verify(DUMMY_ARGON2_HASH, input.password).catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user,
    };
  }

  async refreshTokens(rawRefreshToken: string): Promise<AuthPayloadModel> {
    if (!rawRefreshToken || rawRefreshToken.trim().length === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken.trim());
    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existingToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Reuse detection: If token was already revoked, invalidate all active tokens for this user
    if (existingToken.revokedAt !== null) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: existingToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check expiration
    if (existingToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke the old token
    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    // Issue new token pair
    const tokens = await this.generateTokens(existingToken.user);

    return {
      ...tokens,
      user: existingToken.user,
    };
  }

  async logout(rawRefreshToken: string): Promise<boolean> {
    if (!rawRefreshToken || rawRefreshToken.trim().length === 0) {
      return true;
    }

    const tokenHash = this.hashToken(rawRefreshToken.trim());
    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (existingToken && !existingToken.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existingToken.id },
        data: { revokedAt: new Date() },
      });
    }

    return true;
  }
}
