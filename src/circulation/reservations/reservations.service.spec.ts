import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ReservationCancelReason,
  ReservationStatus,
  Role,
} from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { CATALOG_PUBLIC_API } from '../../books';
import { UNPAID_FINES_PORT } from '../holds/ports/unpaid-fines.port';
import {
  AlreadyHeldError,
  AlreadyQueuedError,
  BookNotFoundError,
  CopyAvailableError,
  OverdueLoansError,
  QueueLimitReachedError,
  ReservationNotFoundError,
  ReservationNotWaitingError,
  UnpaidFinesError,
} from './errors';
import { ReservationCancelledEvent, ReservationJoinedEvent } from './events';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prismaMock: any;
  let clockServiceMock: any;
  let eventEmitterMock: any;
  let catalogPublicApiMock: any;
  let unpaidFinesPortMock: any;

  const fixedNow = new Date('2026-11-01T12:00:00.000Z');

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn((callback) => callback(prismaMock)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      copy: {
        count: jest.fn().mockResolvedValue(0),
      },
      hold: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      reservation: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    clockServiceMock = {
      now: jest.fn().mockReturnValue(fixedNow),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    catalogPublicApiMock = {
      findBookById: jest
        .fn()
        .mockResolvedValue({ id: 10, title: 'Clean Architecture' }),
    };

    unpaidFinesPortMock = {
      checkMemberFines: jest.fn().mockResolvedValue({ blocked: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: clockServiceMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: CATALOG_PUBLIC_API, useValue: catalogPublicApiMock },
        { provide: UNPAID_FINES_PORT, useValue: unpaidFinesPortMock },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('joinQueue', () => {
    it('throws BookNotFoundError if book does not exist in catalog', async () => {
      catalogPublicApiMock.findBookById.mockResolvedValueOnce(null);

      await expect(service.joinQueue(1, 999)).rejects.toThrow(
        BookNotFoundError,
      );
    });

    it('throws CopyAvailableError if at least one copy is AVAILABLE', async () => {
      prismaMock.copy.count.mockResolvedValueOnce(1);

      await expect(service.joinQueue(1, 10)).rejects.toThrow(
        CopyAvailableError,
      );
    });

    it('throws AlreadyHeldError if member has an active hold on this book', async () => {
      prismaMock.hold.findFirst.mockResolvedValueOnce({ id: 42 });

      await expect(service.joinQueue(1, 10)).rejects.toThrow(AlreadyHeldError);
    });

    it('throws AlreadyQueuedError if member already has a WAITING reservation for this book', async () => {
      prismaMock.reservation.findFirst.mockResolvedValueOnce({ id: 84 });

      await expect(service.joinQueue(1, 10)).rejects.toThrow(
        AlreadyQueuedError,
      );
    });

    it('throws QueueLimitReachedError if member already has 5 active WAITING reservations', async () => {
      prismaMock.reservation.count.mockResolvedValueOnce(5);

      await expect(service.joinQueue(1, 10)).rejects.toThrow(
        QueueLimitReachedError,
      );
    });

    it('throws UnpaidFinesError if member has outstanding unpaid fines', async () => {
      unpaidFinesPortMock.checkMemberFines.mockResolvedValueOnce({
        blocked: true,
        reason: 'UNPAID_FINES',
      });

      await expect(service.joinQueue(1, 10)).rejects.toThrow(UnpaidFinesError);
    });

    it('throws OverdueLoansError if member has overdue loans', async () => {
      unpaidFinesPortMock.checkMemberFines.mockResolvedValueOnce({
        blocked: true,
        reason: 'OVERDUE_LOANS',
      });

      await expect(service.joinQueue(1, 10)).rejects.toThrow(OverdueLoansError);
    });

    it('successfully joins the queue and emits reservation.joined post-commit', async () => {
      const createdReservation = {
        id: 101,
        userId: 1,
        bookId: 10,
        status: ReservationStatus.WAITING,
        createdAt: fixedNow,
        promotedAt: null,
        holdId: null,
        cancelledAt: null,
        cancelReason: null,
        cancelledById: null,
      };

      prismaMock.reservation.count
        .mockResolvedValueOnce(0) // active reservations for user check
        .mockResolvedValueOnce(3); // position count (3 patrons ahead/inclusive)

      prismaMock.reservation.create.mockResolvedValueOnce(createdReservation);

      const result = await service.joinQueue(1, 10);

      expect(result).toEqual({
        ...createdReservation,
        position: 3,
      });

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        ReservationJoinedEvent.EVENT_NAME,
        expect.objectContaining({
          reservationId: 101,
          userId: 1,
          bookId: 10,
          position: 3,
        }),
      );
    });
  });

  describe('leaveQueue', () => {
    it('throws ReservationNotFoundError if reservation does not exist', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.leaveQueue(999, { id: 1, role: Role.MEMBER }),
      ).rejects.toThrow(ReservationNotFoundError);
    });

    it('throws ForbiddenException if member attempts to cancel another patrons reservation', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 101,
        userId: 2, // Different user
        status: ReservationStatus.WAITING,
      });

      await expect(
        service.leaveQueue(101, { id: 1, role: Role.MEMBER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ReservationNotWaitingError if reservation is not WAITING', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 101,
        userId: 1,
        status: ReservationStatus.PROMOTED,
      });

      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          id: 101,
          userId: 1,
          status: ReservationStatus.PROMOTED,
        },
      ]);

      await expect(
        service.leaveQueue(101, { id: 1, role: Role.MEMBER }),
      ).rejects.toThrow(ReservationNotWaitingError);
    });

    it('allows a member to cancel their own WAITING reservation with default MEMBER reason', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 101,
        userId: 1,
        bookId: 10,
        status: ReservationStatus.WAITING,
      });

      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          id: 101,
          userId: 1,
          bookId: 10,
          status: ReservationStatus.WAITING,
        },
      ]);

      const updatedReservation = {
        id: 101,
        userId: 1,
        bookId: 10,
        status: ReservationStatus.CANCELLED,
        cancelReason: ReservationCancelReason.MEMBER,
        cancelledById: 1,
        cancelledAt: fixedNow,
      };

      prismaMock.reservation.update.mockResolvedValueOnce(updatedReservation);

      const result = await service.leaveQueue(101, {
        id: 1,
        role: Role.MEMBER,
      });

      expect(result).toEqual(updatedReservation);
      expect(prismaMock.reservation.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: fixedNow,
          cancelReason: ReservationCancelReason.MEMBER,
          cancelledById: 1,
        },
      });

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        ReservationCancelledEvent.EVENT_NAME,
        expect.objectContaining({
          reservationId: 101,
          userId: 1,
          bookId: 10,
          reason: ReservationCancelReason.MEMBER,
          cancelledById: 1,
        }),
      );
    });

    it('allows staff to cancel any reservation with default STAFF reason', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 101,
        userId: 42,
        bookId: 10,
        status: ReservationStatus.WAITING,
      });

      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          id: 101,
          userId: 42,
          bookId: 10,
          status: ReservationStatus.WAITING,
        },
      ]);

      const updatedReservation = {
        id: 101,
        userId: 42,
        bookId: 10,
        status: ReservationStatus.CANCELLED,
        cancelReason: ReservationCancelReason.STAFF,
        cancelledById: 99,
        cancelledAt: fixedNow,
      };

      prismaMock.reservation.update.mockResolvedValueOnce(updatedReservation);

      const result = await service.leaveQueue(101, {
        id: 99,
        role: Role.LIBRARIAN,
      });

      expect(result).toEqual(updatedReservation);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        ReservationCancelledEvent.EVENT_NAME,
        expect.objectContaining({
          reservationId: 101,
          userId: 42,
          bookId: 10,
          reason: ReservationCancelReason.STAFF,
          cancelledById: 99,
        }),
      );
    });
  });

  describe('Read queries', () => {
    it('myReservations queries using CTE with position', async () => {
      const mockRows = [
        {
          id: 101,
          userId: 1,
          bookId: 10,
          status: ReservationStatus.WAITING,
          createdAt: fixedNow,
          position: 1,
        },
        {
          id: 50,
          userId: 1,
          bookId: 12,
          status: ReservationStatus.PROMOTED,
          createdAt: fixedNow,
          position: null,
        },
      ];

      prismaMock.$queryRaw.mockResolvedValueOnce(mockRows);

      const result = await service.myReservations(1);
      expect(result).toEqual(mockRows);
    });

    it('getQueueForBook maps reservations to 1-based positions', async () => {
      const mockList = [
        { id: 10, bookId: 5, status: ReservationStatus.WAITING },
        { id: 15, bookId: 5, status: ReservationStatus.WAITING },
      ];

      prismaMock.reservation.findMany.mockResolvedValueOnce(mockList);

      const result = await service.getQueueForBook(5);
      expect(result).toEqual([
        { id: 10, bookId: 5, status: ReservationStatus.WAITING, position: 1 },
        { id: 15, bookId: 5, status: ReservationStatus.WAITING, position: 2 },
      ]);
    });

    it('getQueuePosition returns null for non-WAITING or non-existent', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce(null);
      expect(await service.getQueuePosition(999)).toBeNull();

      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 10,
        bookId: 5,
        status: ReservationStatus.CANCELLED,
      });
      expect(await service.getQueuePosition(10)).toBeNull();
    });

    it('getQueuePosition returns 1-based count for WAITING reservation', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 10,
        bookId: 5,
        status: ReservationStatus.WAITING,
      });
      prismaMock.reservation.count.mockResolvedValueOnce(2);

      const position = await service.getQueuePosition(10);
      expect(position).toBe(2);
    });

    it('countWaitingByBookId queries count with status WAITING', async () => {
      prismaMock.reservation.count.mockResolvedValueOnce(4);
      const count = await service.countWaitingByBookId(5);
      expect(count).toBe(4);
      expect(prismaMock.reservation.count).toHaveBeenCalledWith({
        where: { bookId: 5, status: ReservationStatus.WAITING },
      });
    });
  });

  describe('cancelWaitingForUserAndBook (Superseding)', () => {
    it('returns null if patron has no WAITING reservation for the book', async () => {
      prismaMock.reservation.findFirst.mockResolvedValueOnce(null);

      const result = await service.cancelWaitingForUserAndBook(
        prismaMock,
        1,
        10,
      );

      expect(result).toBeNull();
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('cancels active WAITING reservation with SUPERSEDED reason and emits event', async () => {
      prismaMock.reservation.findFirst.mockResolvedValueOnce({
        id: 55,
        userId: 1,
        bookId: 10,
        status: ReservationStatus.WAITING,
      });

      const updated = {
        id: 55,
        userId: 1,
        bookId: 10,
        status: ReservationStatus.CANCELLED,
        cancelReason: ReservationCancelReason.SUPERSEDED,
        cancelledById: 1,
        cancelledAt: fixedNow,
      };

      prismaMock.reservation.update.mockResolvedValueOnce(updated);

      const onCommitMock = jest.fn((cb) => cb());

      const result = await service.cancelWaitingForUserAndBook(
        prismaMock,
        1,
        10,
        ReservationCancelReason.SUPERSEDED,
        1,
        onCommitMock,
      );

      expect(result).toEqual(updated);
      expect(prismaMock.reservation.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: fixedNow,
          cancelReason: ReservationCancelReason.SUPERSEDED,
          cancelledById: 1,
        },
      });

      expect(onCommitMock).toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        ReservationCancelledEvent.EVENT_NAME,
        expect.objectContaining({
          reservationId: 55,
          userId: 1,
          bookId: 10,
          reason: ReservationCancelReason.SUPERSEDED,
        }),
      );
    });
  });
});
