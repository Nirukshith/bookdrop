import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DOMAIN_EVENT_NAMES,
  UserMembershipApprovedPayload,
  UserMembershipRejectedPayload,
} from '../contracts/events';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityPublicApi, MemberDto } from './identity-public-api.interface';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  membershipNumber?: string;
  membershipStatus?: MembershipStatus;
}

export type MembershipDecision = 'APPROVE' | 'REJECT';

@Injectable()
export class UsersService implements IdentityPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
        membershipStatus: true,
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
        membershipStatus: true,
      },
    });
  }

  async getMembershipStatus(userId: number): Promise<MembershipStatus | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { membershipStatus: true },
    });
    return user?.membershipStatus ?? null;
  }

  // --- Internal UsersService Methods ---

  async findByMembershipNumber(membershipNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { membershipNumber },
    });
  }

  async listByMembershipStatus(status: MembershipStatus): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { role: Role.MEMBER, membershipStatus: status },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Approves or rejects a member's membership application.
   * Only MEMBER accounts can be reviewed. A PENDING or REJECTED application
   * can be approved; only a PENDING application can be rejected (revoking an
   * approved member is a separate concern and not supported here).
   */
  async reviewMembership(
    reviewerId: number,
    targetUserId: number,
    decision: MembershipDecision,
    /** Rejection reason shown to the member in the email (ignored when approving). */
    reason?: string,
  ): Promise<User> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }
    if (target.role !== Role.MEMBER) {
      throw new BadRequestException(
        'Only member accounts require membership approval',
      );
    }

    const allowedFrom: MembershipStatus[] =
      decision === 'APPROVE'
        ? [MembershipStatus.PENDING, MembershipStatus.REJECTED]
        : [MembershipStatus.PENDING];
    if (!allowedFrom.includes(target.membershipStatus)) {
      throw new BadRequestException(
        `Cannot ${decision === 'APPROVE' ? 'approve' : 'reject'} a membership that is ${target.membershipStatus}`,
      );
    }

    const reviewedAt = new Date();
    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        membershipStatus:
          decision === 'APPROVE'
            ? MembershipStatus.APPROVED
            : MembershipStatus.REJECTED,
        membershipReviewedAt: reviewedAt,
        membershipReviewedById: reviewerId,
      },
    });

    // NotificationsSubscriber (user.*) turns these into MEMBERSHIP_APPROVED /
    // MEMBERSHIP_REJECTED emails. Dedupe keys are per member, so a concurrent
    // double-review still sends only one email of each kind.
    const base = {
      domain: 'user',
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      membershipNumber: updated.membershipNumber,
      occurredAt: reviewedAt,
    };
    if (decision === 'APPROVE') {
      const payload: UserMembershipApprovedPayload = {
        ...base,
        eventName: DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_APPROVED,
        approvedById: reviewerId,
      };
      this.eventEmitter.emit(
        DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_APPROVED,
        payload,
      );
    } else {
      const payload: UserMembershipRejectedPayload = {
        ...base,
        eventName: DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_REJECTED,
        rejectedById: reviewerId,
        reason: reason?.trim() || null,
      };
      this.eventEmitter.emit(
        DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_REJECTED,
        payload,
      );
    }

    return updated;
  }

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

    try {
      return await this.prisma.user.create({
        data: {
          name: data.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: data.role ?? Role.MEMBER,
          ...(data.membershipNumber !== undefined && {
            membershipNumber: data.membershipNumber,
          }),
          ...(data.membershipStatus !== undefined && {
            membershipStatus: data.membershipStatus,
          }),
        },
      });
    } catch (err) {
      // Unique-constraint race: another registration claimed the same email
      // or membership number between the caller's pre-check and this insert.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = String(err.meta?.target ?? '');
        throw new ConflictException(
          target.includes('membershipNumber')
            ? 'This membership number is already registered'
            : 'Email is already registered',
        );
      }
      throw err;
    }
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
