import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  MissedPickupsResolver,
  RecentMissedPickupResolver,
} from './missed-pickups.resolver';
import { MissedPickupsDataLoader } from './missed-pickups.loader';
import { PrismaService } from '../../prisma/prisma.service';
import { IDENTITY_PUBLIC_API } from '../../users';
import { AuthenticatedUser } from '../../auth';

describe('MissedPickupsResolver (Unit Tests)', () => {
  let resolver: MissedPickupsResolver;
  let recentResolver: RecentMissedPickupResolver;
  let prismaMock: any;
  let identityPublicApiMock: any;
  let dataLoaderMock: any;

  beforeEach(async () => {
    prismaMock = {
      missedPickup: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            holdId: 10,
            excused: false,
            excusedReason: null,
            createdAt: new Date('2026-11-06T10:00:00.000Z'),
            hold: { bookId: 42 },
          },
        ]),
      },
    };

    identityPublicApiMock = {
      findMemberByEmail: jest.fn(),
      getMembersByIds: jest.fn(),
    };

    dataLoaderMock = {
      loadBookTitle: jest.fn().mockResolvedValue('Clean Architecture'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissedPickupsResolver,
        RecentMissedPickupResolver,
        { provide: PrismaService, useValue: prismaMock },
        { provide: IDENTITY_PUBLIC_API, useValue: identityPublicApiMock },
        { provide: MissedPickupsDataLoader, useValue: dataLoaderMock },
      ],
    }).compile();

    resolver = module.get<MissedPickupsResolver>(MissedPickupsResolver);
    recentResolver = module.get<RecentMissedPickupResolver>(
      RecentMissedPickupResolver,
    );
  });

  describe('myMissedPickups', () => {
    it('returns caller unassessed count, threshold 3, and recent missed pickups', async () => {
      const user: AuthenticatedUser = {
        sub: 7,
        email: 'member@example.com',
        role: Role.MEMBER,
      };

      const result = await resolver.myMissedPickups(user);

      expect(result.unassessedCount).toBe(2);
      expect(result.threshold).toBe(3);
      expect(result.recent).toHaveLength(1);
      expect(result.recent[0].bookId).toBe(42);
      expect(prismaMock.missedPickup.count).toHaveBeenCalledWith({
        where: { userId: 7, fineId: null, excused: false },
      });
    });
  });

  describe('memberMissedPickups', () => {
    it('allows staff to look up member missed pickups by email', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue({
        id: 15,
        email: 'patron@example.com',
        name: 'Patron Doe',
        role: Role.MEMBER,
      });

      const result = await resolver.memberMissedPickups('patron@example.com');

      expect(result.unassessedCount).toBe(2);
      expect(prismaMock.missedPickup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 15 },
        }),
      );
    });

    it('throws NotFoundException when member is not found by email', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue(null);

      await expect(
        resolver.memberMissedPickups('nonexistent@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveBookTitle', () => {
    it('delegates to MissedPickupsDataLoader', async () => {
      const title = await recentResolver.resolveBookTitle({
        id: 1,
        holdId: 10,
        bookId: 42,
        missedAt: new Date(),
        excused: false,
      });

      expect(title).toBe('Clean Architecture');
      expect(dataLoaderMock.loadBookTitle).toHaveBeenCalledWith(42);
    });
  });
});
