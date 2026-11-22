import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENT_NAMES } from '../contracts/events';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let eventEmitterMock: { emit: jest.Mock };
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
    eventEmitterMock = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        { provide: EventEmitter2, useValue: eventEmitterMock },
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
    it('updates another user role successfully', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 2,
        name: 'Bob',
        role: Role.MEMBER,
      });
      prismaMock.user.update.mockResolvedValue({
        id: 2,
        name: 'Bob',
        role: Role.LIBRARIAN,
      });

      const updated = await service.updateRole(1, 2, Role.LIBRARIAN);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { role: Role.LIBRARIAN },
      });
      expect(updated.role).toBe(Role.LIBRARIAN);
    });

    it('prevents an admin from demoting themselves from ADMIN role', async () => {
      await expect(service.updateRole(1, 1, Role.MEMBER)).rejects.toThrow(
        new BadRequestException('Admins cannot remove their own admin role'),
      );

      await expect(service.updateRole(1, 1, Role.LIBRARIAN)).rejects.toThrow(
        new BadRequestException('Admins cannot remove their own admin role'),
      );
    });

    it('allows an admin to re-apply ADMIN role to themselves', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        name: 'Admin Alice',
        role: Role.ADMIN,
      });
      prismaMock.user.update.mockResolvedValue({
        id: 1,
        name: 'Admin Alice',
        role: Role.ADMIN,
      });

      const updated = await service.updateRole(1, 1, Role.ADMIN);
      expect(updated.role).toBe(Role.ADMIN);
    });

    it('throws NotFoundException if target user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.updateRole(1, 999, Role.LIBRARIAN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('IdentityPublicApi implementation', () => {
    describe('findMemberByEmail', () => {
      it('queries with trimmed and lowercased email and only selects public fields', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 5,
          name: 'Public Member',
          email: 'member@example.com',
          role: Role.MEMBER,
        });

        const member = await service.findMemberByEmail('  MEMBER@example.COM ');

        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
          where: { email: 'member@example.com' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            membershipStatus: true,
          },
        });
        expect(member).toEqual({
          id: 5,
          name: 'Public Member',
          email: 'member@example.com',
          role: Role.MEMBER,
        });
        expect((member as any).passwordHash).toBeUndefined();
      });

      it('returns null if member not found', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        const member = await service.findMemberByEmail('unknown@example.com');
        expect(member).toBeNull();
      });
    });

    describe('getMembersByIds', () => {
      it('returns empty array without querying database if ids array is empty', async () => {
        const result = await service.getMembersByIds([]);
        expect(result).toEqual([]);
        expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      });

      it('queries users by ids and only selects public fields', async () => {
        prismaMock.user.findMany.mockResolvedValue([
          {
            id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            role: Role.MEMBER,
          },
          {
            id: 2,
            name: 'Bob',
            email: 'bob@example.com',
            role: Role.LIBRARIAN,
          },
        ]);

        const result = await service.getMembersByIds([1, 2]);

        expect(prismaMock.user.findMany).toHaveBeenCalledWith({
          where: {
            id: { in: [1, 2] },
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            membershipStatus: true,
          },
        });
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe(1);
        expect(result[1].id).toBe(2);
        expect((result[0] as any).passwordHash).toBeUndefined();
      });
    });
  });

  describe('membership approval', () => {
    const pendingMember = {
      id: 42,
      role: Role.MEMBER,
      membershipStatus: MembershipStatus.PENDING,
    };

    describe('getMembershipStatus', () => {
      it('returns the stored status', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          membershipStatus: MembershipStatus.PENDING,
        });
        await expect(service.getMembershipStatus(42)).resolves.toBe(
          MembershipStatus.PENDING,
        );
        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
          where: { id: 42 },
          select: { membershipStatus: true },
        });
      });

      it('returns null when the user does not exist', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        await expect(service.getMembershipStatus(999)).resolves.toBeNull();
      });
    });

    describe('listByMembershipStatus', () => {
      it('lists only MEMBER accounts with the status, oldest first', async () => {
        prismaMock.user.findMany.mockResolvedValue([]);
        await service.listByMembershipStatus(MembershipStatus.PENDING);
        expect(prismaMock.user.findMany).toHaveBeenCalledWith({
          where: {
            role: Role.MEMBER,
            membershipStatus: MembershipStatus.PENDING,
          },
          orderBy: { createdAt: 'asc' },
        });
      });
    });

    describe('reviewMembership', () => {
      it.each([
        ['APPROVE', MembershipStatus.APPROVED],
        ['REJECT', MembershipStatus.REJECTED],
      ] as const)(
        '%s a PENDING member records the decision and reviewer',
        async (decision, expected) => {
          prismaMock.user.findUnique.mockResolvedValue(pendingMember);
          prismaMock.user.update.mockResolvedValue({
            ...pendingMember,
            membershipStatus: expected,
          });

          await service.reviewMembership(1, 42, decision);

          expect(prismaMock.user.update).toHaveBeenCalledWith({
            where: { id: 42 },
            data: {
              membershipStatus: expected,
              membershipReviewedAt: expect.any(Date),
              membershipReviewedById: 1,
            },
          });
        },
      );

      it('emits user.membership_approved after approving, for the approval email', async () => {
        prismaMock.user.findUnique.mockResolvedValue(pendingMember);
        prismaMock.user.update.mockResolvedValue({
          id: 42,
          name: 'Reader',
          email: 'reader@example.com',
          membershipNumber: 'LIB-0042',
          membershipStatus: MembershipStatus.APPROVED,
        });

        await service.reviewMembership(1, 42, 'APPROVE');

        expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
        expect(eventEmitterMock.emit).toHaveBeenCalledWith(
          DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_APPROVED,
          expect.objectContaining({
            eventName: DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_APPROVED,
            userId: 42,
            email: 'reader@example.com',
            name: 'Reader',
            membershipNumber: 'LIB-0042',
            approvedById: 1,
            occurredAt: expect.any(Date),
          }),
        );
      });

      it('emits only user.membership_rejected when rejecting, for the rejection email', async () => {
        prismaMock.user.findUnique.mockResolvedValue(pendingMember);
        prismaMock.user.update.mockResolvedValue({
          id: 42,
          name: 'Reader',
          email: 'reader@example.com',
          membershipNumber: 'LIB-0042',
          membershipStatus: MembershipStatus.REJECTED,
        });

        await service.reviewMembership(7, 42, 'REJECT');

        expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
        expect(eventEmitterMock.emit).toHaveBeenCalledWith(
          DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_REJECTED,
          expect.objectContaining({
            eventName: DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_REJECTED,
            userId: 42,
            email: 'reader@example.com',
            name: 'Reader',
            membershipNumber: 'LIB-0042',
            rejectedById: 7,
            occurredAt: expect.any(Date),
          }),
        );
      });

      it('passes a trimmed rejection reason to the event, for the email', async () => {
        prismaMock.user.findUnique.mockResolvedValue(pendingMember);
        prismaMock.user.update.mockResolvedValue({
          id: 42,
          name: 'Reader',
          email: 'reader@example.com',
          membershipNumber: 'LIB-0042',
          membershipStatus: MembershipStatus.REJECTED,
        });

        await service.reviewMembership(
          7,
          42,
          'REJECT',
          '  Card number not found  ',
        );

        expect(eventEmitterMock.emit).toHaveBeenCalledWith(
          DOMAIN_EVENT_NAMES.USER_MEMBERSHIP_REJECTED,
          expect.objectContaining({ reason: 'Card number not found' }),
        );
      });

      it('does not emit when a rejection is refused', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...pendingMember,
          membershipStatus: MembershipStatus.REJECTED,
        });

        await expect(service.reviewMembership(1, 42, 'REJECT')).rejects.toThrow(
          BadRequestException,
        );
        expect(eventEmitterMock.emit).not.toHaveBeenCalled();
      });

      it('does not emit when the review is refused', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...pendingMember,
          membershipStatus: MembershipStatus.APPROVED,
        });

        await expect(
          service.reviewMembership(1, 42, 'APPROVE'),
        ).rejects.toThrow(BadRequestException);
        expect(eventEmitterMock.emit).not.toHaveBeenCalled();
      });

      it('can approve a previously REJECTED member', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...pendingMember,
          membershipStatus: MembershipStatus.REJECTED,
        });
        prismaMock.user.update.mockResolvedValue({});
        await expect(
          service.reviewMembership(1, 42, 'APPROVE'),
        ).resolves.toBeDefined();
      });

      it.each([
        ['APPROVE', MembershipStatus.APPROVED],
        ['REJECT', MembershipStatus.APPROVED],
        ['REJECT', MembershipStatus.REJECTED],
      ] as const)(
        'refuses to %s a member who is already %s',
        async (decision, current) => {
          prismaMock.user.findUnique.mockResolvedValue({
            ...pendingMember,
            membershipStatus: current,
          });
          await expect(
            service.reviewMembership(1, 42, decision),
          ).rejects.toThrow(BadRequestException);
          expect(prismaMock.user.update).not.toHaveBeenCalled();
        },
      );

      it('refuses to review staff accounts', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...pendingMember,
          role: Role.LIBRARIAN,
        });
        await expect(
          service.reviewMembership(1, 42, 'APPROVE'),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws NotFoundException for an unknown user', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        await expect(
          service.reviewMembership(1, 42, 'APPROVE'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('create', () => {
      it('stores membership number and status when provided', async () => {
        prismaMock.user.create.mockResolvedValue({ id: 7 });
        await service.create({
          name: 'Reader',
          email: 'reader@example.com',
          password: 'password123',
          membershipNumber: 'LIB-0001',
          membershipStatus: MembershipStatus.PENDING,
        });
        expect(prismaMock.user.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            membershipNumber: 'LIB-0001',
            membershipStatus: MembershipStatus.PENDING,
          }),
        });
      });

      it('maps a duplicate membership number race to ConflictException', async () => {
        prismaMock.user.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['membershipNumber'] },
          }),
        );
        await expect(
          service.create({
            name: 'Reader',
            email: 'reader@example.com',
            password: 'password123',
            membershipNumber: 'LIB-0001',
          }),
        ).rejects.toThrow('This membership number is already registered');
      });

      it('maps a duplicate email race to ConflictException', async () => {
        prismaMock.user.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['email'] },
          }),
        );
        await expect(
          service.create({
            name: 'Reader',
            email: 'reader@example.com',
            password: 'password123',
          }),
        ).rejects.toThrow(ConflictException);
      });
    });
  });
});
