import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Fine, FineReason, FineStatus } from '@prisma/client';
import { FinesService } from './fines.service';
import { ClockService } from '../../common/clock/clock.service';
import { DOMAIN_EVENT_NAMES } from '../../contracts/events';
import {
  FineNotFoundError,
  FineNotPayableError,
  FineOverpaymentError,
} from './errors';

describe('FinesService (Unit Tests)', () => {
  let service: FinesService;
  let prismaMock: any;
  let eventEmitterMock: jest.Mocked<EventEmitter2>;
  let clockServiceMock: jest.Mocked<ClockService>;

  const fixedNow = new Date('2026-11-04T12:00:00.000Z');

  beforeEach(() => {
    eventEmitterMock = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    clockServiceMock = {
      now: jest.fn().mockReturnValue(fixedNow),
    } as unknown as jest.Mocked<ClockService>;

    prismaMock = {
      fine: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      finePayment: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    service = new FinesService(prismaMock, eventEmitterMock, clockServiceMock);
  });

  describe('Dedupe key helper methods', () => {
    it('generates standard dedupe keys', () => {
      expect(FinesService.buildLateReturnDedupeKey(12)).toBe('late-return:12');
      expect(FinesService.buildLostDedupeKey(15)).toBe('lost:15');
      expect(FinesService.buildDamagedDedupeKey(99)).toBe('damaged:99');
    });
  });

  describe('createFine', () => {
    it('validates fine amount and throws if invalid', async () => {
      await expect(
        service.createFine({
          userId: 1,
          reason: FineReason.LATE_RETURN,
          amountMinor: 0,
          dedupeKey: 'late-return:1',
        }),
      ).rejects.toThrow('Fine amount in minor units must be greater than zero');

      await expect(
        service.createFine({
          userId: 1,
          reason: FineReason.LATE_RETURN,
          amountMinor: -500,
          dedupeKey: 'late-return:1',
        }),
      ).rejects.toThrow('Fine amount in minor units must be greater than zero');

      await expect(
        service.createFine({
          userId: 1,
          reason: FineReason.LATE_RETURN,
          amountMinor: 10.5,
          dedupeKey: 'late-return:1',
        }),
      ).rejects.toThrow('Fine amount in minor units must be an integer');
    });

    it('creates fine via raw INSERT ON CONFLICT DO NOTHING and returns newly inserted row', async () => {
      const mockFine: Fine = {
        id: 100,
        userId: 42,
        reason: FineReason.LATE_RETURN,
        amountMinor: 500,
        paidMinor: 0,
        status: FineStatus.UNPAID,
        loanId: 10,
        daysLate: 5,
        note: null,
        dedupeKey: 'late-return:10',
        createdById: 1,
        createdAt: fixedNow,
        settledAt: null,
        waivedById: null,
        waivedReason: null,
      };

      prismaMock.$queryRaw.mockResolvedValueOnce([mockFine]);

      const result = await service.createFine({
        userId: 42,
        reason: FineReason.LATE_RETURN,
        amountMinor: 500,
        loanId: 10,
        daysLate: 5,
        dedupeKey: 'late-return:10',
        createdById: 1,
      });

      expect(result).toEqual(mockFine);
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'fine.created',
        expect.objectContaining({
          fineId: 100,
          userId: 42,
          reason: FineReason.LATE_RETURN,
          amountMinor: 500,
          loanId: 10,
        }),
      );
    });

    it('returns existing fine when dedupeKey already exists without throwing error or emitting events', async () => {
      const existingFine: Fine = {
        id: 99,
        userId: 42,
        reason: FineReason.LATE_RETURN,
        amountMinor: 500,
        paidMinor: 200,
        status: FineStatus.PARTIALLY_PAID,
        loanId: 10,
        daysLate: 5,
        note: null,
        dedupeKey: 'late-return:10',
        createdById: 1,
        createdAt: fixedNow,
        settledAt: null,
        waivedById: null,
        waivedReason: null,
      };

      // Conflict occurred -> 0 rows returned from raw insert
      prismaMock.$queryRaw.mockResolvedValueOnce([]);
      prismaMock.fine.findUniqueOrThrow.mockResolvedValueOnce(existingFine);

      const result = await service.createFine({
        userId: 42,
        reason: FineReason.LATE_RETURN,
        amountMinor: 500,
        loanId: 10,
        daysLate: 5,
        dedupeKey: 'late-return:10',
      });

      expect(result).toEqual(existingFine);
      expect(prismaMock.fine.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { dedupeKey: 'late-return:10' },
      });
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });

  describe('recordPayment', () => {
    it('throws BadRequestException when payment amount is <= 0 or not an integer', async () => {
      await expect(service.recordPayment(1, 0, 5)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.recordPayment(1, -100, 5)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.recordPayment(1, 50.5, 5)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws FineNotFoundError when fine does not exist', async () => {
      prismaMock.fine.findUnique.mockResolvedValueOnce(null);

      await expect(service.recordPayment(999, 100, 5)).rejects.toThrow(
        FineNotFoundError,
      );
    });

    it('throws FineNotPayableError when fine is already PAID or WAIVED', async () => {
      const paidFine = { id: 1, userId: 10, status: FineStatus.PAID };
      prismaMock.fine.findUnique.mockResolvedValueOnce(paidFine);
      prismaMock.$queryRaw.mockResolvedValueOnce([paidFine]);

      await expect(service.recordPayment(1, 100, 5)).rejects.toThrow(
        FineNotPayableError,
      );

      const waivedFine = { id: 2, userId: 10, status: FineStatus.WAIVED };
      prismaMock.fine.findUnique.mockResolvedValueOnce(waivedFine);
      prismaMock.$queryRaw.mockResolvedValueOnce([waivedFine]);

      await expect(service.recordPayment(2, 100, 5)).rejects.toThrow(
        FineNotPayableError,
      );
    });

    it('throws FineOverpaymentError when amount exceeds outstanding balance', async () => {
      const fine = {
        id: 1,
        userId: 10,
        amountMinor: 1000,
        paidMinor: 600,
        status: FineStatus.PARTIALLY_PAID,
      };
      prismaMock.fine.findUnique.mockResolvedValueOnce(fine);
      prismaMock.$queryRaw.mockResolvedValueOnce([fine]);

      // Outstanding is 400; trying to pay 401
      await expect(service.recordPayment(1, 401, 5)).rejects.toThrow(
        FineOverpaymentError,
      );
    });

    it('successfully processes a partial payment and emits fine.payment_recorded', async () => {
      const fine = {
        id: 1,
        userId: 10,
        reason: FineReason.LATE_RETURN,
        amountMinor: 1000,
        paidMinor: 0,
        status: FineStatus.UNPAID,
      };
      const payment = { id: 10, fineId: 1, amountMinor: 400, receivedById: 5 };
      const updatedFine = {
        ...fine,
        paidMinor: 400,
        status: FineStatus.PARTIALLY_PAID,
        settledAt: null,
      };

      prismaMock.fine.findUnique.mockResolvedValueOnce(fine);
      prismaMock.$queryRaw.mockResolvedValueOnce([fine]);
      prismaMock.finePayment.create.mockResolvedValueOnce(payment);
      prismaMock.fine.update.mockResolvedValueOnce(updatedFine);

      const result = await service.recordPayment(1, 400, 5, 'Cash payment');

      expect(result).toEqual(updatedFine);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
      expect(prismaMock.finePayment.create).toHaveBeenCalledWith({
        data: {
          fineId: 1,
          amountMinor: 400,
          receivedById: 5,
          note: 'Cash payment',
          createdAt: fixedNow,
        },
      });
      expect(prismaMock.fine.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          paidMinor: 400,
          status: FineStatus.PARTIALLY_PAID,
          settledAt: null,
        },
      });

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.FINE_PAYMENT_RECORDED,
        expect.objectContaining({
          eventName: 'fine.payment_recorded',
          fineId: 1,
          paymentId: 10,
          userId: 10,
          amountMinor: 400,
          paidMinor: 400,
          remainingMinor: 600,
        }),
      );
      expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.FINE_SETTLED,
        expect.anything(),
      );
    });

    it('successfully processes full settlement and emits fine.payment_recorded AND fine.settled', async () => {
      const fine = {
        id: 1,
        userId: 10,
        reason: FineReason.LATE_RETURN,
        amountMinor: 1000,
        paidMinor: 400,
        status: FineStatus.PARTIALLY_PAID,
      };
      const payment = { id: 11, fineId: 1, amountMinor: 600, receivedById: 5 };
      const updatedFine = {
        ...fine,
        paidMinor: 1000,
        status: FineStatus.PAID,
        settledAt: fixedNow,
      };

      prismaMock.fine.findUnique.mockResolvedValueOnce(fine);
      prismaMock.$queryRaw.mockResolvedValueOnce([fine]);
      prismaMock.finePayment.create.mockResolvedValueOnce(payment);
      prismaMock.fine.update.mockResolvedValueOnce(updatedFine);

      const result = await service.recordPayment(1, 600, 5);

      expect(result).toEqual(updatedFine);
      expect(prismaMock.fine.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          paidMinor: 1000,
          status: FineStatus.PAID,
          settledAt: fixedNow,
        },
      });

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.FINE_PAYMENT_RECORDED,
        expect.objectContaining({
          fineId: 1,
          amountMinor: 600,
          paidMinor: 1000,
          remainingMinor: 0,
        }),
      );

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.FINE_SETTLED,
        expect.objectContaining({
          eventName: 'fine.settled',
          fineId: 1,
          userId: 10,
          status: FineStatus.PAID,
          settledAt: fixedNow,
        }),
      );
    });
  });

  describe('waiveFine', () => {
    it('throws BadRequestException if reason is empty or whitespace', async () => {
      await expect(service.waiveFine(1, '', 9)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.waiveFine(1, '   ', 9)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws FineNotFoundError if fine does not exist', async () => {
      prismaMock.fine.findUnique.mockResolvedValueOnce(null);

      await expect(service.waiveFine(999, 'Special waiver', 9)).rejects.toThrow(
        FineNotFoundError,
      );
    });

    it('throws FineNotPayableError if fine is already PAID or WAIVED', async () => {
      const paidFine = { id: 1, userId: 10, status: FineStatus.PAID };
      prismaMock.fine.findUnique.mockResolvedValueOnce(paidFine);
      prismaMock.$queryRaw.mockResolvedValueOnce([paidFine]);

      await expect(service.waiveFine(1, 'Waive paid', 9)).rejects.toThrow(
        FineNotPayableError,
      );
    });

    it('successfully waives UNPAID fine, sets settledAt, and emits fine.settled', async () => {
      const fine = {
        id: 1,
        userId: 10,
        reason: FineReason.DAMAGED_BOOK,
        amountMinor: 2000,
        paidMinor: 0,
        status: FineStatus.UNPAID,
      };
      const updatedFine = {
        ...fine,
        status: FineStatus.WAIVED,
        waivedById: 9,
        waivedReason: 'Admin authorized library promotion waiver',
        settledAt: fixedNow,
      };

      prismaMock.fine.findUnique.mockResolvedValueOnce(fine);
      prismaMock.$queryRaw.mockResolvedValueOnce([fine]);
      prismaMock.fine.update.mockResolvedValueOnce(updatedFine);

      const result = await service.waiveFine(
        1,
        'Admin authorized library promotion waiver',
        9,
      );

      expect(result).toEqual(updatedFine);
      expect(prismaMock.fine.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: FineStatus.WAIVED,
          waivedById: 9,
          waivedReason: 'Admin authorized library promotion waiver',
          settledAt: fixedNow,
        },
      });

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.FINE_SETTLED,
        expect.objectContaining({
          eventName: 'fine.settled',
          fineId: 1,
          userId: 10,
          status: FineStatus.WAIVED,
          settledAt: fixedNow,
        }),
      );
    });

    it('waives PARTIALLY_PAID fine while keeping previous payments intact', async () => {
      const fine = {
        id: 2,
        userId: 10,
        reason: FineReason.LATE_RETURN,
        amountMinor: 1000,
        paidMinor: 300,
        status: FineStatus.PARTIALLY_PAID,
      };
      const updatedFine = {
        ...fine,
        status: FineStatus.WAIVED,
        waivedById: 9,
        waivedReason: 'Hardship waiver',
        settledAt: fixedNow,
      };

      prismaMock.fine.findUnique.mockResolvedValueOnce(fine);
      prismaMock.$queryRaw.mockResolvedValueOnce([fine]);
      prismaMock.fine.update.mockResolvedValueOnce(updatedFine);

      const result = await service.waiveFine(2, 'Hardship waiver', 9);

      expect(result.paidMinor).toBe(300);
      expect(result.status).toBe(FineStatus.WAIVED);
    });
  });

  describe('Read methods', () => {
    it('getMemberFines computes outstanding amount per fine and total outstanding amount', async () => {
      const mockFines: Fine[] = [
        {
          id: 1,
          userId: 50,
          reason: FineReason.LATE_RETURN,
          amountMinor: 1000,
          paidMinor: 400,
          status: FineStatus.PARTIALLY_PAID,
          loanId: null,
          daysLate: 2,
          note: null,
          dedupeKey: null,
          createdById: null,
          createdAt: fixedNow,
          settledAt: null,
          waivedById: null,
          waivedReason: null,
        },
        {
          id: 2,
          userId: 50,
          reason: FineReason.MISSED_PICKUPS,
          amountMinor: 200,
          paidMinor: 0,
          status: FineStatus.UNPAID,
          loanId: null,
          daysLate: null,
          note: null,
          dedupeKey: null,
          createdById: null,
          createdAt: fixedNow,
          settledAt: null,
          waivedById: null,
          waivedReason: null,
        },
        {
          id: 3,
          userId: 50,
          reason: FineReason.LATE_RETURN,
          amountMinor: 500,
          paidMinor: 500,
          status: FineStatus.PAID,
          loanId: null,
          daysLate: 1,
          note: null,
          dedupeKey: null,
          createdById: null,
          createdAt: fixedNow,
          settledAt: fixedNow,
          waivedById: null,
          waivedReason: null,
        },
        {
          id: 4,
          userId: 50,
          reason: FineReason.DAMAGED_BOOK,
          amountMinor: 1500,
          paidMinor: 300,
          status: FineStatus.WAIVED,
          loanId: null,
          daysLate: null,
          note: null,
          dedupeKey: null,
          createdById: null,
          createdAt: fixedNow,
          settledAt: fixedNow,
          waivedById: 9,
          waivedReason: 'Forgiven',
        },
      ];

      prismaMock.fine.findMany.mockResolvedValueOnce(mockFines);

      const result = await service.getMemberFines(50);

      expect(result.fines).toHaveLength(4);
      expect(result.fines[0].outstandingMinor).toBe(600); // 1000 - 400
      expect(result.fines[1].outstandingMinor).toBe(200); // 200 - 0
      expect(result.fines[2].outstandingMinor).toBe(0); // PAID
      expect(result.fines[3].outstandingMinor).toBe(0); // WAIVED
      expect(result.totalOutstandingMinor).toBe(800); // 600 + 200
    });

    it('listFines applies filters and pagination', async () => {
      const mockItems = [{ id: 1 }, { id: 2 }];
      prismaMock.fine.findMany.mockResolvedValueOnce(mockItems);
      prismaMock.fine.count.mockResolvedValueOnce(15);

      const result = await service.listFines(
        {
          userId: 42,
          status: FineStatus.UNPAID,
          reason: FineReason.LATE_RETURN,
        },
        { skip: 10, take: 5 },
      );

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(15);
      expect(prismaMock.fine.findMany).toHaveBeenCalledWith({
        where: {
          userId: 42,
          status: FineStatus.UNPAID,
          reason: FineReason.LATE_RETURN,
        },
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('getFine retrieves single fine with its payments', async () => {
      const mockFineWithPayments = {
        id: 1,
        payments: [{ id: 10, amountMinor: 500 }],
      };
      prismaMock.fine.findUnique.mockResolvedValueOnce(mockFineWithPayments);

      const result = await service.getFine(1);
      expect(result).toEqual(mockFineWithPayments);
      expect(prismaMock.fine.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          payments: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });

    it('getFine throws FineNotFoundError if not found', async () => {
      prismaMock.fine.findUnique.mockResolvedValueOnce(null);
      await expect(service.getFine(999)).rejects.toThrow(FineNotFoundError);
    });
  });

  describe('FinesPublicApi methods', () => {
    it('getOutstandingFines returns only UNPAID and PARTIALLY_PAID fines', async () => {
      const mockFines = [{ id: 1, status: FineStatus.UNPAID }];
      prismaMock.fine.findMany.mockResolvedValueOnce(mockFines);

      const result = await service.getOutstandingFines(42);

      expect(result).toEqual(mockFines);
      expect(prismaMock.fine.findMany).toHaveBeenCalledWith({
        where: {
          userId: 42,
          status: { in: [FineStatus.UNPAID, FineStatus.PARTIALLY_PAID] },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('getOutstandingTotalMinor computes sum of unpaid balances', async () => {
      const mockFines = [
        { amountMinor: 500, paidMinor: 100 },
        { amountMinor: 1000, paidMinor: 0 },
      ];
      prismaMock.fine.findMany.mockResolvedValueOnce(mockFines);

      const total = await service.getOutstandingTotalMinor(42);
      expect(total).toBe(400 + 1000); // 1400
    });
  });
});
