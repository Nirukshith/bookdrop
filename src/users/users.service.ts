import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityPublicApi, MemberDto } from './identity-public-api.interface';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
}

@Injectable()
export class UsersService implements IdentityPublicApi {
  constructor(private readonly prisma: PrismaService) {}

  // --- IdentityPublicApi Implementation ---

  async findMemberByEmail(email: string): Promise<MemberDto | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
  }

  async getMembersByIds(ids: number[]): Promise<MemberDto[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
  }

  // --- Internal UsersService Methods ---

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: CreateUserInput): Promise<User> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(data.password);

    return this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: data.role ?? Role.MEMBER,
      },
    });
  }

  async list(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async updateRole(
    actorId: number,
    targetUserId: number,
    role: Role,
  ): Promise<User> {
    if (actorId === targetUserId && role !== Role.ADMIN) {
      throw new BadRequestException(
        'Admins cannot remove their own admin role',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
    });
  }
}
