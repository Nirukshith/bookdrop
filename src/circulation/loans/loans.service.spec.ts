import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  FineReason,
  HoldStatus,
  LoanStatus,
  ReturnCondition,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { CopiesService } from '../copies/copies.service';
import { HOLDS_PUBLIC_API } from '../holds/holds-public-api.interface';
import { IDENTITY_PUBLIC_API } from '../../users';
import { MemberEligibilityPolicy } from '../holds/member-eligibility.policy';
import { LoansService } from './loans.service';
import { FinesService } from '../fines/fines.service';
import { COPY_RELEASE_PORT, CopyReleasePort } from './ports';
import {
  ConditionNoteRequiredError,
  CopyMismatchError,
  CopyNotAvailableError,
  CopyNotFoundError,
  CopyOnHoldError,
  HoldExistsUsePickupError,
  HoldExpiredError,
  HoldNotActiveError,
  HoldNotFoundError,
  LoanNotActiveError,
  LoanNotFoundError,
  MemberNotFoundError,
  NoActiveLoanForCopyError,
} from './errors';
import { HoldFulfilledEvent } from '../holds/events/hold-fulfilled.event';
import { LoanStartedEvent } from './events/loan-started.event';

describe('LoansService (Step 5)', () => {
  let service: LoansService;
  let prismaMock: any;
  let txMock: any;
  let clockServiceMock: { now: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let copiesServiceMock: { transitionStatus: jest.Mock };
  let finesServiceMock: { createFine: jest.Mock };
  let copyReleasePortMock: { release: jest.Mock };
  let holdsPublicApiMock: {
    fulfillHold: jest.Mock;
    getHold: jest.Mock;
    expireHold: jest.Mock;
  };
  let identityPublicApiMock: {
    getMembersByIds: jest.Mock;
    findMemberByEmail: jest.Mock;
  };
  let eligibilityPolicyMock: {
    checkCheckoutEligibility: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };

  const fixedNow = new Date('2026-10-25T10:00:00.000Z');
  const staffId = 999;
  const memberId = 42;
  const holdId = 10;
  const copyId = 55;
  const bookId = 101;
  const validBarcode = 'BD-000055';

  beforeEach(async () => {
    txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      hold: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      copy: {
        findUnique: jest.fn(),
      },
      loan: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    prismaMock = {
      $transaction: jest.fn(async (callback) => callback(txMock)),
      loan: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      copy: {
        findUnique: jest.fn(),
      },
    };

    clockServiceMock = {
      now: jest.fn().mockReturnValue(new Date(fixedNow)),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key, defaultVal) => {
        if (key === 'LIBRARY_TIMEZONE') return 'UTC';
        return defaultVal;
      }),
    };

    copiesServiceMock = {
      transitionStatus: jest
        .fn()
        .mockResolvedValue({ id: copyId, status: CopyStatus.BORROWED }),
    };

    holdsPublicApiMock = {
      fulfillHold: jest
        .fn()
        .mockResolvedValue({ id: holdId, status: HoldStatus.FULFILLED }),
      getHold: jest.fn(),
      expireHold: jest
        .fn()
        .mockResolvedValue({ id: holdId, status: HoldStatus.EXPIRED }),
    };

    identityPublicApiMock = {
      getMembersByIds: jest.fn().mockResolvedValue([
        {
          id: memberId,
          name: 'Alice Member',
          email: 'alice@example.com',
          role: Role.MEMBER,
        },
      ]),
      findMemberByEmail: jest.fn(),
    };

    eligibilityPolicyMock = {
      checkCheckoutEligibility: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    finesServiceMock = {
      createFine: jest.fn().mockResolvedValue({ id: 1 }),
    };

    copyReleasePortMock = {
      release: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: clockServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CopiesService, useValue: copiesServiceMock },
        { provide: FinesService, useValue: finesServiceMock },
        { provide: COPY_RELEASE_PORT, useValue: copyReleasePortMock },
        { provide: HOLDS_PUBLIC_API, useValue: holdsPublicApiMock },
        { provide: IDENTITY_PUBLIC_API, useValue: identityPublicApiMock },
        { provide: MemberEligibilityPolicy, useValue: eligibilityPolicyMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
  });

  describe('confirmPickup', () => {
    const validExpiresAt = new Date('2026-10-26T10:00:00.000Z');

    beforeEach(() => {
      // Step 1: Unlocked hold lookup
      txMock.hold.findUnique.mockResolvedValue({ userId: memberId });

      // Step 2: Locked hold FOR UPDATE
      txMock.$queryRaw.mockImplementation(
        (queryParts: TemplateStringsArray) => {
          const query = queryParts.join('');
          if (query.includes('FROM "Hold"')) {
            return Promise.resolve([
              {
                id: holdId,
                userId: memberId,
                bookId,
                copyId,
                status: HoldStatus.ACTIVE,
                expiresAt: validExpiresAt,
              },
            ]);
          }
          if (query.includes('FROM "Copy"')) {
            return Promise.resolve([
              {
                id: copyId,
                bookId,
                barcode: validBarcode,
                status: CopyStatus.ON_HOLD,
                retiredAt: null,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      // Step 8: Loan insertion
      txMock.loan.create.mockResolvedValue({
        id: 1,
        userId: memberId,
        copyId,
        bookId,
        holdId,
        status: LoanStatus.ACTIVE,
        borrowedAt: fixedNow,
        dueAt: new Date('2026-11-08T23:59:59.999Z'),
        checkedOutById: staffId,
      });
    });

    it('successfully confirms pickup, updates hold, transitions copy, and emits loan.created', async () => {
      const loan = await service.confirmPickup(holdId, validBarcode, staffId);

      expect(loan).toBeDefined();
      expect(loan.id).toBe(1);

      // Verify advisory lock taken on member
      expect(txMock.$executeRaw).toHaveBeenCalled();

      // Verify checkout eligibility check executed inside transaction
      expect(
        eligibilityPolicyMock.checkCheckoutEligibility,
      ).toHaveBeenCalledWith(memberId, txMock);

      // Verify fulfillHold called inside transaction
      expect(holdsPublicApiMock.fulfillHold).toHaveBeenCalledWith(
        holdId,
        txMock,
      );

      // Verify copy transitioned ON_HOLD -> BORROWED inside transaction
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        copyId,
        [CopyStatus.ON_HOLD],
        CopyStatus.BORROWED,
        expect.objectContaining({ changedById: staffId }),
        txMock,
      );

      // Verify Loan record created
      expect(txMock.loan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: memberId,
          copyId,
          bookId,
          holdId,
          status: LoanStatus.ACTIVE,
          checkedOutById: staffId,
        }),
        include: { copy: true },
      });

      // Verify hold.fulfilled and loan.started events emitted post-commit
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        HoldFulfilledEvent.EVENT_NAME,
        expect.objectContaining({
          holdId,
          loanId: 1,
        }),
      );

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        LoanStartedEvent.EVENT_NAME,
        expect.objectContaining({
          loanId: 1,
          userId: memberId,
          copyId,
          bookId,
          source: 'PICKUP',
        }),
      );
    });

    it('throws HoldNotFoundError if preliminary hold does not exist', async () => {
      txMock.hold.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmPickup(holdId, validBarcode, staffId),
      ).rejects.toThrow(HoldNotFoundError);
    });

    it('throws HoldNotActiveError if locked hold is not in ACTIVE status', async () => {
      txMock.$queryRaw.mockImplementation(
        (queryParts: TemplateStringsArray) => {
          const query = queryParts.join('');
          if (query.includes('FROM "Hold"')) {
            return Promise.resolve([
              {
                id: holdId,
                userId: memberId,
                bookId,
                copyId,
                status: HoldStatus.CANCELLED,
                expiresAt: validExpiresAt,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      await expect(
        service.confirmPickup(holdId, validBarcode, staffId),
      ).rejects.toThrow(HoldNotActiveError);
    });

    it('throws HoldExpiredError when hold has expired, and calls expireHold post-rollback', async () => {
      const expiredAt = new Date('2026-10-24T10:00:00.000Z'); // expired yesterday

      txMock.$queryRaw.mockImplementation(
        (queryParts: TemplateStringsArray) => {
          const query = queryParts.join('');
          if (query.includes('FROM "Hold"')) {
            return Promise.resolve([
              {
                id: holdId,
                userId: memberId,
                bookId,
                copyId,
                status: HoldStatus.ACTIVE,
                expiresAt: expiredAt,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      await expect(
        service.confirmPickup(holdId, validBarcode, staffId),
      ).rejects.toThrow(HoldExpiredError);

      // Verify self-healing: expireHold called in separate autonomous call
      expect(holdsPublicApiMock.expireHold).toHaveBeenCalledWith(holdId);
      expect(txMock.loan.create).not.toHaveBeenCalled();
    });

    it('throws CopyMismatchError if scanned barcode does not match held copy', async () => {
      await expect(
        service.confirmPickup(holdId, 'BD-DIFFERENT-BARCODE', staffId),
      ).rejects.toThrow(CopyMismatchError);

      expect(txMock.loan.create).not.toHaveBeenCalled();
    });
  });

  describe('checkoutCopy (Walk-in)', () => {
    beforeEach(() => {
      txMock.$queryRaw.mockImplementation(
        (queryParts: TemplateStringsArray) => {
          const query = queryParts.join('');
          if (query.includes('FROM "Copy"')) {
            return Promise.resolve([
              {
                id: copyId,
                bookId,
                barcode: validBarcode,
                status: CopyStatus.AVAILABLE,
                retiredAt: null,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      txMock.hold.findFirst.mockResolvedValue(null);

      txMock.loan.create.mockResolvedValue({
        id: 2,
        userId: memberId,
        copyId,
        bookId,
        holdId: null,
        status: LoanStatus.ACTIVE,
        borrowedAt: fixedNow,
        dueAt: new Date('2026-11-08T23:59:59.999Z'),
        checkedOutById: staffId,
      });
    });

    it('successfully lends available copy to walk-in member with holdId = null', async () => {
      const loan = await service.checkoutCopy(memberId, validBarcode, staffId);

      expect(loan).toBeDefined();
      expect(loan.id).toBe(2);

      // Verify member advisory lock
      expect(txMock.$executeRaw).toHaveBeenCalled();

      // Verify member lookup via IdentityPublicApi
      expect(identityPublicApiMock.getMembersByIds).toHaveBeenCalledWith([
        memberId,
      ]);

      // Verify eligibility check
      expect(
        eligibilityPolicyMock.checkCheckoutEligibility,
      ).toHaveBeenCalledWith(memberId, txMock);

      // Verify copy transitioned AVAILABLE -> BORROWED
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        copyId,
        [CopyStatus.AVAILABLE],
        CopyStatus.BORROWED,
        expect.objectContaining({ changedById: staffId }),
        txMock,
      );

      // Verify loan created with holdId: null
      expect(txMock.loan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: memberId,
          copyId,
          bookId,
          holdId: null,
          status: LoanStatus.ACTIVE,
          checkedOutById: staffId,
        }),
        include: { copy: true },
      });

      // Verify loan.started event emitted post-commit with source = 'WALK_IN'
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        LoanStartedEvent.EVENT_NAME,
        expect.objectContaining({
          loanId: 2,
          userId: memberId,
          copyId,
          bookId,
          source: 'WALK_IN',
        }),
      );
    });

    it('throws MemberNotFoundError if member does not exist in identity area', async () => {
      identityPublicApiMock.getMembersByIds.mockResolvedValue([]);

      await expect(
        service.checkoutCopy(memberId, validBarcode, staffId),
      ).rejects.toThrow(MemberNotFoundError);

      expect(txMock.loan.create).not.toHaveBeenCalled();
    });

    it('throws CopyNotFoundError if barcode does not exist', async () => {
      txMock.$queryRaw.mockResolvedValue([]);

      await expect(
        service.checkoutCopy(memberId, 'NON-EXISTENT', staffId),
      ).rejects.toThrow(CopyNotFoundError);
    });

    it('throws CopyNotAvailableError if copy is retired', async () => {
      txMock.$queryRaw.mockResolvedValue([
        {
          id: copyId,
          bookId,
          barcode: validBarcode,
          status: CopyStatus.AVAILABLE,
          retiredAt: new Date(),
        },
      ]);

      await expect(
        service.checkoutCopy(memberId, validBarcode, staffId),
      ).rejects.toThrow(CopyNotAvailableError);
    });

    it('throws CopyOnHoldError if copy is currently ON_HOLD for another patron', async () => {
      txMock.$queryRaw.mockResolvedValue([
        {
          id: copyId,
          bookId,
          barcode: validBarcode,
          status: CopyStatus.ON_HOLD,
          retiredAt: null,
        },
      ]);

      await expect(
        service.checkoutCopy(memberId, validBarcode, staffId),
      ).rejects.toThrow(CopyOnHoldError);
    });

    it('throws CopyNotAvailableError if copy is BORROWED, LOST, or DAMAGED', async () => {
      txMock.$queryRaw.mockResolvedValue([
        {
          id: copyId,
          bookId,
          barcode: validBarcode,
          status: CopyStatus.BORROWED,
          retiredAt: null,
        },
      ]);

      await expect(
        service.checkoutCopy(memberId, validBarcode, staffId),
      ).rejects.toThrow(CopyNotAvailableError);
    });

    it('throws HoldExistsUsePickupError if walk-in member already has an active hold on this book', async () => {
      txMock.hold.findFirst.mockResolvedValue({ id: 88 });

      await expect(
        service.checkoutCopy(memberId, validBarcode, staffId),
      ).rejects.toThrow(HoldExistsUsePickupError);
    });
  });

  describe('Read Methods', () => {
    it('listMemberLoans queries loans by userId', async () => {
      prismaMock.loan.findMany.mockResolvedValue([{ id: 1, userId: memberId }]);

      const loans = await service.listMemberLoans(memberId, LoanStatus.ACTIVE);

      expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
        where: { userId: memberId, status: LoanStatus.ACTIVE },
        include: { copy: true },
        orderBy: { borrowedAt: 'desc' },
      });
      expect(loans).toHaveLength(1);
    });

    it('listStaffLoans applies filters and dynamically checks overdue loans', async () => {
      prismaMock.loan.findMany.mockResolvedValue([{ id: 10 }]);
      prismaMock.loan.count.mockResolvedValue(1);

      const result = await service.listStaffLoans(
        { overdue: true, userId: memberId },
        { skip: 0, take: 10 },
      );

      expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
        where: {
          userId: memberId,
          status: LoanStatus.ACTIVE,
          dueAt: { lt: fixedNow },
        },
        skip: 0,
        take: 10,
        include: { copy: true },
        orderBy: { borrowedAt: 'desc' },
      });
      expect(result.total).toBe(1);
    });

    it('getLoan retrieves a loan by ID or throws LoanNotFoundError', async () => {
      prismaMock.loan.findUnique.mockResolvedValue({ id: 5 });
      const loan = await service.getLoan(5);
      expect(loan.id).toBe(5);

      prismaMock.loan.findUnique.mockResolvedValue(null);
      await expect(service.getLoan(999)).rejects.toThrow(LoanNotFoundError);
    });

    it('getActiveLoanByCopyBarcode finds active loan by copy barcode', async () => {
      prismaMock.copy.findUnique.mockResolvedValue({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValue({
        id: 1,
        copyId,
        status: LoanStatus.ACTIVE,
      });

      const loan = await service.getActiveLoanByCopyBarcode(validBarcode);
      expect(loan?.id).toBe(1);

      prismaMock.copy.findUnique.mockResolvedValue(null);
      await expect(
        service.getActiveLoanByCopyBarcode('UNKNOWN'),
      ).rejects.toThrow(CopyNotFoundError);
    });

    it('getActiveLoanByCopyId returns active loan by copy ID', async () => {
      prismaMock.loan.findFirst.mockResolvedValue({
        id: 1,
        copyId,
        status: LoanStatus.ACTIVE,
      });

      const loan = await service.getActiveLoanByCopyId(copyId);
      expect(loan?.id).toBe(1);
    });

    it('isOverdue correctly evaluates based on clock time and loan status', () => {
      const activeOverdue = {
        status: LoanStatus.ACTIVE,
        dueAt: new Date(fixedNow.getTime() - 1000), // due in the past
      };
      expect(service.isOverdue(activeOverdue)).toBe(true);

      const activeNotOverdue = {
        status: LoanStatus.ACTIVE,
        dueAt: new Date(fixedNow.getTime() + 1000), // due in the future
      };
      expect(service.isOverdue(activeNotOverdue)).toBe(false);

      const returnedPastDue = {
        status: LoanStatus.RETURNED,
        dueAt: new Date(fixedNow.getTime() - 1000),
      };
      expect(service.isOverdue(returnedPastDue)).toBe(false);
    });
  });

  describe('returnLoan (Step 5)', () => {
    it('throws CopyNotFoundError if copy barcode does not exist', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.returnLoan({
          copyBarcode: 'INVALID-BARCODE',
          condition: ReturnCondition.GOOD,
          staffId: 1,
        }),
      ).rejects.toThrow(CopyNotFoundError);
    });

    it('throws NoActiveLoanForCopyError if copy has no ACTIVE loan', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.returnLoan({
          copyBarcode: validBarcode,
          condition: ReturnCondition.GOOD,
          staffId: 1,
        }),
      ).rejects.toThrow(NoActiveLoanForCopyError);
    });

    it('throws ConditionNoteRequiredError if condition is DAMAGED and conditionNote is missing or empty', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValueOnce({
        id: 1,
        copyId,
        userId: memberId,
        status: LoanStatus.ACTIVE,
      });

      await expect(
        service.returnLoan({
          copyBarcode: validBarcode,
          condition: ReturnCondition.DAMAGED,
          conditionNote: '   ',
          staffId: 1,
        }),
      ).rejects.toThrow(ConditionNoteRequiredError);
    });

    it('throws LoanNotActiveError if loan is already RETURNED when locked FOR UPDATE', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValueOnce({
        id: 1,
        copyId,
        userId: memberId,
        status: LoanStatus.ACTIVE,
      });

      txMock.$queryRaw.mockResolvedValueOnce([
        { id: 1, status: LoanStatus.RETURNED },
      ]);

      await expect(
        service.returnLoan({
          copyBarcode: validBarcode,
          condition: ReturnCondition.GOOD,
          staffId: 1,
        }),
      ).rejects.toThrow(LoanNotActiveError);
    });

    it('returns an on-time loan in GOOD condition (no fine, calls copyReleasePort.release)', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValueOnce({
        id: 1,
        copyId,
        userId: memberId,
        status: LoanStatus.ACTIVE,
      });

      // Locked loan: due date in the future (on-time)
      const dueAt = new Date(fixedNow.getTime() + 2 * 86400000);
      txMock.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 1,
            userId: memberId,
            copyId,
            status: LoanStatus.ACTIVE,
            dueAt,
          },
        ]) // locked loan
        .mockResolvedValueOnce([{ id: copyId, status: CopyStatus.BORROWED }]); // locked copy

      const updatedLoan = {
        id: 1,
        status: LoanStatus.RETURNED,
        returnCondition: ReturnCondition.GOOD,
        returnedAt: fixedNow,
        returnedById: 5,
      };
      txMock.loan.update.mockResolvedValueOnce(updatedLoan);

      const result = await service.returnLoan({
        copyBarcode: validBarcode,
        condition: ReturnCondition.GOOD,
        staffId: 5,
      });

      expect(result).toEqual(updatedLoan);
      expect(txMock.$executeRaw).toHaveBeenCalled();
      expect(copyReleasePortMock.release).toHaveBeenCalledWith(
        copyId,
        expect.anything(),
      );
      expect(finesServiceMock.createFine).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'loan.returned',
        expect.objectContaining({
          loanId: 1,
          condition: ReturnCondition.GOOD,
        }),
      );
    });

    it('returns an overdue loan in GOOD condition (creates LATE_RETURN fine and calls copyReleasePort.release)', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValueOnce({
        id: 1,
        copyId,
        userId: memberId,
        status: LoanStatus.ACTIVE,
      });

      // Locked loan: due date 3 days in the past (overdue)
      const dueAt = new Date(fixedNow.getTime() - 3 * 86400000);
      txMock.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 1,
            userId: memberId,
            copyId,
            status: LoanStatus.ACTIVE,
            dueAt,
          },
        ]) // locked loan
        .mockResolvedValueOnce([{ id: copyId, status: CopyStatus.BORROWED }]); // locked copy

      const updatedLoan = {
        id: 1,
        status: LoanStatus.RETURNED,
        returnCondition: ReturnCondition.GOOD,
        returnedAt: fixedNow,
        returnedById: 5,
      };
      txMock.loan.update.mockResolvedValueOnce(updatedLoan);

      const result = await service.returnLoan({
        copyBarcode: validBarcode,
        condition: ReturnCondition.GOOD,
        staffId: 5,
      });

      expect(result).toEqual(updatedLoan);
      expect(copyReleasePortMock.release).toHaveBeenCalledWith(
        copyId,
        expect.anything(),
      );
      expect(finesServiceMock.createFine).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: memberId,
          reason: FineReason.LATE_RETURN,
          loanId: 1,
          dedupeKey: 'late-return:1',
          createdById: 5,
        }),
        expect.anything(),
      );
    });

    it('returns a DAMAGED copy with assessed damage fee (transitions copy to DAMAGED, creates DAMAGED_BOOK fine, skips copyReleasePort)', async () => {
      prismaMock.copy.findUnique.mockResolvedValueOnce({
        id: copyId,
        barcode: validBarcode,
      });
      prismaMock.loan.findFirst.mockResolvedValueOnce({
        id: 1,
        copyId,
        userId: memberId,
        status: LoanStatus.ACTIVE,
      });

      // On-time return, but damaged
      const dueAt = new Date(fixedNow.getTime() + 86400000);
      txMock.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 1,
            userId: memberId,
            copyId,
            status: LoanStatus.ACTIVE,
            dueAt,
          },
        ])
        .mockResolvedValueOnce([{ id: copyId, status: CopyStatus.BORROWED }]);

      const updatedLoan = {
        id: 1,
        status: LoanStatus.RETURNED,
        returnCondition: ReturnCondition.DAMAGED,
        conditionNote: 'Water damage on pages 10-25',
        returnedAt: fixedNow,
        returnedById: 5,
      };
      txMock.loan.update.mockResolvedValueOnce(updatedLoan);

      const result = await service.returnLoan({
        copyBarcode: validBarcode,
        condition: ReturnCondition.DAMAGED,
        conditionNote: 'Water damage on pages 10-25',
        damageFeeRs: 50,
        staffId: 5,
      });

      expect(result).toEqual(updatedLoan);
      expect(copyReleasePortMock.release).not.toHaveBeenCalled();
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        copyId,
        [CopyStatus.BORROWED],
        CopyStatus.DAMAGED,
        {
          reason: 'Water damage on pages 10-25',
          changedById: 5,
        },
        expect.anything(),
      );
      expect(finesServiceMock.createFine).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: memberId,
          reason: FineReason.DAMAGED_BOOK,
          amountMinor: 5000, // Rs. 50 in paise
          loanId: 1,
          note: 'Water damage on pages 10-25',
          dedupeKey: 'damaged:1',
          createdById: 5,
        }),
        expect.anything(),
      );
    });
  });

  describe('markLoanLost (Step 5)', () => {
    it('throws LoanNotFoundError if loan does not exist', async () => {
      prismaMock.loan.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.markLoanLost({
          loanId: 999,
          assessedFeeRs: 100,
          note: 'Patron lost it on the train',
          staffId: 5,
        }),
      ).rejects.toThrow(LoanNotFoundError);
    });

    it('throws BadRequestException if note is missing or whitespace', async () => {
      await expect(
        service.markLoanLost({
          loanId: 1,
          assessedFeeRs: 100,
          note: '   ',
          staffId: 5,
        }),
      ).rejects.toThrow('A note is required when declaring a loan lost');
    });

    it('throws error if assessed fee is not a positive integer', async () => {
      await expect(
        service.markLoanLost({
          loanId: 1,
          assessedFeeRs: 0,
          note: 'Lost book',
          staffId: 5,
        }),
      ).rejects.toThrow('Fine amount must be greater than zero');
    });

    it('throws LoanNotActiveError if locked loan is not ACTIVE', async () => {
      prismaMock.loan.findUnique.mockResolvedValueOnce({
        id: 1,
        userId: memberId,
        copyId,
        status: LoanStatus.ACTIVE,
      });

      txMock.$queryRaw.mockResolvedValueOnce([
        { id: 1, status: LoanStatus.RETURNED },
      ]);

      await expect(
        service.markLoanLost({
          loanId: 1,
          assessedFeeRs: 150,
          note: 'Lost on transit',
          staffId: 5,
        }),
      ).rejects.toThrow(LoanNotActiveError);
    });

    it('successfully marks loan as LOST (updates loan, transitions copy to LOST, creates LOST_BOOK fine, no late fee)', async () => {
      prismaMock.loan.findUnique.mockResolvedValueOnce({
        id: 1,
        userId: memberId,
        copyId,
        status: LoanStatus.ACTIVE,
      });

      txMock.$queryRaw
        .mockResolvedValueOnce([
          { id: 1, userId: memberId, copyId, status: LoanStatus.ACTIVE },
        ])
        .mockResolvedValueOnce([{ id: copyId, status: CopyStatus.BORROWED }]);

      const updatedLoan = {
        id: 1,
        status: LoanStatus.LOST,
        lostAt: fixedNow,
      };
      txMock.loan.update.mockResolvedValueOnce(updatedLoan);

      const result = await service.markLoanLost({
        loanId: 1,
        assessedFeeRs: 250,
        note: 'Dog chewed book beyond recognition',
        staffId: 5,
      });

      expect(result).toEqual(updatedLoan);
      expect(txMock.$executeRaw).toHaveBeenCalled();
      expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
        copyId,
        [CopyStatus.BORROWED],
        CopyStatus.LOST,
        {
          reason: 'Dog chewed book beyond recognition',
          changedById: 5,
        },
        expect.anything(),
      );
      expect(finesServiceMock.createFine).toHaveBeenCalledWith(
        {
          userId: memberId,
          reason: FineReason.LOST_BOOK,
          amountMinor: 25000, // Rs. 250 in paise
          loanId: 1,
          note: 'Dog chewed book beyond recognition',
          dedupeKey: 'lost:1',
          createdById: 5,
        },
        expect.anything(),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'loan.lost',
        expect.objectContaining({
          loanId: 1,
        }),
      );
    });
  });
});
