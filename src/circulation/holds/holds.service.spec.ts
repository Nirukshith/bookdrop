import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CopyStatus, HoldSource, HoldStatus } from '@prisma/client';
import { HoldsService } from './holds.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BooksService } from '../../books';
import { CopiesService } from '../copies/copies.service';
import { ClockService, FakeClockService } from '../../common/clock';
import { MemberEligibilityPolicy } from './member-eligibility.policy';
import {
  HoldCreatedEvent,
  HoldCancelledEvent,
  HoldExpiredEvent,
  HoldFulfilledEvent,
} from './events';
import {
  HoldNotFoundError,
  NoCopiesAvailableError,
  MaxActiveHoldsReachedError,
} from './errors';

describe('HoldsService (Step 5)', () => {
  let service: HoldsService;
  let prismaMock: any;
  let booksServiceMock: any;
  let copiesServiceMock: any;
  let fakeClock: FakeClockService;
  let eligibilityPolicyMock: any;
  let eventEmitterMock: any;

  const fixedNow = new Date('2026-10-21T10:00:00.000Z');

  beforeEach(async () => {
    fakeClock = new FakeClockService(fixedNow);

    booksServiceMock = {
      exists: jest.fn().mockResolvedValue(true),
    };

    copiesServiceMock = {
      transitionStatus: jest.fn().mockResolvedValue({
        id: 10,
        bookId: 1,
        status: CopyStatus.ON_HOLD,
      }),
    };

    eligibilityPolicyMock = {
      assertEligible: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    prismaMock = {
      $transaction: jest.fn((cb) => cb(prismaMock)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 10 }]),
      hold: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      copy: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoldsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: BooksService, useValue: booksServiceMock },
        { provide: CopiesService, useValue: copiesServiceMock },
        { provide: ClockService, useValue: fakeClock },
        { provide: MemberEligibilityPolicy, useValue: eligibilityPolicyMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<HoldsService>(HoldsService);
  });

  describe('requestHold', () => {
    const userId = 100;
    const bookId = 1;

    it('successfully requests a hold in exact sequence: lock, verify book, eligibility, copy selection, transition, hold create, event emit', async () => {
      const mockCreatedHold = {
        id: 501,
        userId,
        bookId,
        copyId: 10,
        status: HoldStatus.ACTIVE,
        source: HoldSource.REQUEST,
        expiresAt: new Date('2026-10-22T10:00:00.000Z'),
        createdAt: fixedNow,
        copy: { id: 10, bookId, status: CopyStatus.ON_HOLD },
      };

      prismaMock.hold.create.mockResolvedValue(mockCreatedHold);

      const result = await service.requestHold(userId, bookId);

      expect(result).toEqual(mockCreatedHold);

      // 1. Per-member advisory lock
      expect(prismaMock.$executeRaw).toHaveBeenCalled();

      // 2. Book existence verification
      expect(booksServiceMock.exists).toHaveBeenCalledWith(bookId);

      // 3. Eligibility policy check with transaction
      expect(eligibilityPolicyMock.assertEligible).toHaveBeenCalledWith(
        userId,
        bookId,
        prismaMock,
      );

      // 4. Raw SQL copy selection
      expect(prismaMock.$queryRaw).toHaveBeenCalled();

      // 5. CopiesService transitionStatus joins transaction
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        10,
        [CopyStatus.AVAILABLE],
        CopyStatus.ON_HOLD,
        expect.objectContaining({
          changedById: userId,
        }),
        prismaMock,
      );

      // 6. Hold record insertion
      expect(prismaMock.hold.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          bookId,
          copyId: 10,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: fixedNow,
        }),
        include: { copy: true },
      });

      // 7. Domain event emitted post-commit
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        HoldCreatedEvent.EVENT_NAME,
        expect.any(HoldCreatedEvent),
      );
    });

    it('throws NotFoundException if book does not exist in catalog', async () => {
      booksServiceMock.exists.mockResolvedValue(false);

      await expect(service.requestHold(userId, bookId)).rejects.toThrow(
        NotFoundException,
      );

      expect(eligibilityPolicyMock.assertEligible).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('throws domain error if member eligibility check fails', async () => {
      eligibilityPolicyMock.assertEligible.mockRejectedValue(
        new MaxActiveHoldsReachedError(3),
      );

      await expect(service.requestHold(userId, bookId)).rejects.toThrow(
        MaxActiveHoldsReachedError,
      );

      expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('throws NoCopiesAvailableError if no available copies are found with FOR UPDATE SKIP LOCKED', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      await expect(service.requestHold(userId, bookId)).rejects.toThrow(
        NoCopiesAvailableError,
      );

      expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
      expect(prismaMock.hold.create).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancelHold', () => {
    const holdId = 77;
    const holdOwnerId = 100;
    const otherUserId = 200;

    const activeHold = {
      id: holdId,
      userId: holdOwnerId,
      bookId: 1,
      copyId: 10,
      status: HoldStatus.ACTIVE,
      copy: { id: 10, status: CopyStatus.ON_HOLD },
    };

    it('allows hold owner (MEMBER) to cancel their own hold, releasing copy to AVAILABLE', async () => {
      prismaMock.hold.findUnique.mockResolvedValue(activeHold);
      prismaMock.hold.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.copy.findUnique.mockResolvedValue({
        id: 10,
        status: CopyStatus.ON_HOLD,
      });
      prismaMock.hold.findUniqueOrThrow.mockResolvedValue({
        ...activeHold,
        status: HoldStatus.CANCELLED,
      });

      const result = await service.cancelHold(
        holdId,
        { id: holdOwnerId, role: 'MEMBER' },
        'Changed my mind',
      );

      expect(result.status).toBe(HoldStatus.CANCELLED);
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        10,
        [CopyStatus.ON_HOLD],
        CopyStatus.AVAILABLE,
        expect.objectContaining({ changedById: holdOwnerId }),
        prismaMock,
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        HoldCancelledEvent.EVENT_NAME,
        expect.any(HoldCancelledEvent),
      );
    });

    it('allows staff (LIBRARIAN) to cancel any member hold', async () => {
      prismaMock.hold.findUnique.mockResolvedValue(activeHold);
      prismaMock.hold.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.copy.findUnique.mockResolvedValue({
        id: 10,
        status: CopyStatus.ON_HOLD,
      });
      prismaMock.hold.findUniqueOrThrow.mockResolvedValue({
        ...activeHold,
        status: HoldStatus.CANCELLED,
      });

      const result = await service.cancelHold(
        holdId,
        { id: 999, role: 'LIBRARIAN' },
        'Staff cancellation',
      );

      expect(result.status).toBe(HoldStatus.CANCELLED);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        HoldCancelledEvent.EVENT_NAME,
        expect.any(HoldCancelledEvent),
      );
    });

    it('throws ForbiddenException if a MEMBER tries to cancel another member hold', async () => {
      prismaMock.hold.findUnique.mockResolvedValue(activeHold);

      await expect(
        service.cancelHold(holdId, { id: otherUserId, role: 'MEMBER' }),
      ).rejects.toThrow(ForbiddenException);

      expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
    });

    it('throws HoldNotFoundError if hold does not exist', async () => {
      prismaMock.hold.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelHold(999, { id: holdOwnerId, role: 'MEMBER' }),
      ).rejects.toThrow(HoldNotFoundError);
    });

    it('throws ConflictException if hold is not in ACTIVE status', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        ...activeHold,
        status: HoldStatus.FULFILLED,
      });

      await expect(
        service.cancelHold(holdId, { id: holdOwnerId, role: 'MEMBER' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException and rolls back if copy is not ON_HOLD (data inconsistency)', async () => {
      prismaMock.hold.findUnique.mockResolvedValue(activeHold);
      prismaMock.hold.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.copy.findUnique.mockResolvedValue({
        id: 10,
        status: CopyStatus.AVAILABLE, // unexpected state!
      });

      await expect(
        service.cancelHold(holdId, { id: holdOwnerId, role: 'MEMBER' }),
      ).rejects.toThrow(ConflictException);

      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });

  describe('expireHold (Idempotent single expiration)', () => {
    const holdId = 88;
    const expiredDeadline = new Date('2026-10-21T09:00:00.000Z'); // in past

    it('expires active hold past deadline, releases copy to AVAILABLE, and emits event', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        id: holdId,
        userId: 1,
        bookId: 1,
        copyId: 10,
        status: HoldStatus.ACTIVE,
        expiresAt: expiredDeadline,
      });
      prismaMock.hold.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.hold.findUniqueOrThrow.mockResolvedValue({
        id: holdId,
        userId: 1,
        bookId: 1,
        copyId: 10,
        status: HoldStatus.EXPIRED,
      });

      const result = await service.expireHold(holdId);

      expect(result?.status).toBe(HoldStatus.EXPIRED);
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        10,
        [CopyStatus.ON_HOLD],
        CopyStatus.AVAILABLE,
        expect.any(Object),
        prismaMock,
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        HoldExpiredEvent.EVENT_NAME,
        expect.any(HoldExpiredEvent),
      );
    });

    it('returns null and does nothing if hold deadline has not yet passed', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        id: holdId,
        status: HoldStatus.ACTIVE,
        expiresAt: new Date('2026-10-22T10:00:00.000Z'), // in future
      });

      const result = await service.expireHold(holdId);

      expect(result).toBeNull();
      expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('is idempotent: returns null on second execution if hold is already EXPIRED', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        id: holdId,
        status: HoldStatus.EXPIRED,
        expiresAt: expiredDeadline,
      });

      const result = await service.expireHold(holdId);

      expect(result).toBeNull();
      expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });

  describe('expireDueHolds (Batch Expiration with FOR UPDATE SKIP LOCKED)', () => {
    it('processes due holds and returns count', async () => {
      prismaMock.hold.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }]);
      prismaMock.$queryRaw.mockResolvedValue([{ id: 101, copyId: 21 }]);
      prismaMock.hold.findUniqueOrThrow.mockResolvedValue({
        id: 101,
        userId: 1,
        bookId: 1,
        copyId: 21,
        status: HoldStatus.EXPIRED,
      });

      const summary = await service.expireDueHolds(10);

      expect(summary.totalCandidates).toBe(2);
      expect(summary.processed).toBeGreaterThanOrEqual(1);
      expect(summary.errors).toBe(0);
    });
  });

  describe('fulfillHold (Stage 6 Loans Integration)', () => {
    const holdId = 99;
    const futureDeadline = new Date('2026-10-22T10:00:00.000Z');

    it('fulfills an active hold without modifying copy status', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        id: holdId,
        status: HoldStatus.ACTIVE,
        expiresAt: futureDeadline,
      });
      prismaMock.hold.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.hold.findUniqueOrThrow.mockResolvedValue({
        id: holdId,
        userId: 42,
        bookId: 5,
        copyId: 15,
        status: HoldStatus.FULFILLED,
      });

      const result = await service.fulfillHold(holdId);

      expect(result.status).toBe(HoldStatus.FULFILLED);
      // Crucial requirement: fulfillHold must NOT change the copy
      expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        HoldFulfilledEvent.EVENT_NAME,
        expect.any(HoldFulfilledEvent),
      );
    });

    it('fails cleanly with ConflictException if hold is already fulfilled or cancelled', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        id: holdId,
        status: HoldStatus.CANCELLED,
        expiresAt: futureDeadline,
      });

      await expect(service.fulfillHold(holdId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('fails cleanly with ConflictException if hold has expired', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({
        id: holdId,
        status: HoldStatus.ACTIVE,
        expiresAt: new Date('2026-10-20T10:00:00.000Z'), // expired
      });

      await expect(service.fulfillHold(holdId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('Read Methods', () => {
    it('getHold returns hold when found', async () => {
      prismaMock.hold.findUnique.mockResolvedValue({ id: 1, copy: {} });
      const hold = await service.getHold(1);
      expect(hold.id).toBe(1);
    });

    it('getHold throws HoldNotFoundError when missing', async () => {
      prismaMock.hold.findUnique.mockResolvedValue(null);
      await expect(service.getHold(999)).rejects.toThrow(HoldNotFoundError);
    });

    it('listMemberHolds queries with userId and status', async () => {
      prismaMock.hold.findMany.mockResolvedValue([]);
      await service.listMemberHolds(100, HoldStatus.ACTIVE);
      expect(prismaMock.hold.findMany).toHaveBeenCalledWith({
        where: { userId: 100, status: HoldStatus.ACTIVE },
        include: { copy: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('listHolds filters by status, user, book, and applies pagination', async () => {
      prismaMock.hold.findMany.mockResolvedValue([]);
      prismaMock.hold.count.mockResolvedValue(0);

      const result = await service.listHolds(
        { status: HoldStatus.ACTIVE, userId: 100, bookId: 2 },
        { skip: 10, take: 5 },
      );

      expect(result).toEqual({ items: [], total: 0 });
      expect(prismaMock.hold.findMany).toHaveBeenCalledWith({
        where: { status: HoldStatus.ACTIVE, userId: 100, bookId: 2 },
        skip: 10,
        take: 5,
        include: { copy: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
