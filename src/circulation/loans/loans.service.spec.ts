import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CopyStatus, HoldStatus, LoanStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { CopiesService } from '../copies/copies.service';
import { HOLDS_PUBLIC_API } from '../holds/holds-public-api.interface';
import { IDENTITY_PUBLIC_API } from '../../users';
import { MemberEligibilityPolicy } from '../holds/member-eligibility.policy';
import { LoansService } from './loans.service';
import {
  CopyMismatchError,
  CopyNotAvailableError,
  CopyNotFoundError,
  CopyOnHoldError,
  HoldExistsUsePickupError,
  HoldExpiredError,
  HoldNotActiveError,
  HoldNotFoundError,
  LoanNotFoundError,
  MemberNotFoundError,
} from './errors';
import { LoanCreatedEvent } from './events/loan-created.event';

describe('LoansService (Step 5)', () => {
  let service: LoansService;
  let prismaMock: any;
  let txMock: any;
  let clockServiceMock: { now: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let copiesServiceMock: { transitionStatus: jest.Mock };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: clockServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CopiesService, useValue: copiesServiceMock },
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

      // Verify loan.created event emitted post-commit
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        LoanCreatedEvent.EVENT_NAME,
        expect.objectContaining({
          loanId: 1,
          userId: memberId,
          copyId,
          bookId,
          source: 'HOLD',
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

      // Verify event emitted post-commit with source = 'WALK_IN'
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        LoanCreatedEvent.EVENT_NAME,
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
});
