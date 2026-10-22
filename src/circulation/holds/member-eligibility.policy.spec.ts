import { Test, TestingModule } from '@nestjs/testing';
import { HoldStatus } from '@prisma/client';
import { MemberEligibilityPolicy } from './member-eligibility.policy';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_ACTIVE_HOLDS, MAX_ACTIVE_LOANS } from '../../config/library-rules';
import { ACTIVE_LOAN_COUNT_PORT } from './ports/active-loan-count.port';
import { UNPAID_FINES_PORT } from './ports/unpaid-fines.port';
import { DefaultActiveLoanCountAdapter } from './ports/default-active-loan-count.adapter';
import { DefaultUnpaidFinesAdapter } from './ports/default-unpaid-fines.adapter';
import {
  MaxActiveHoldsReachedError,
  MaxActiveLoansReachedError,
  UnpaidFinesError,
  DuplicateActiveHoldError,
  HoldErrorCode,
} from './errors';

describe('MemberEligibilityPolicy (Step 3)', () => {
  let policy: MemberEligibilityPolicy;
  let prismaMock: {
    hold: {
      count: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let loanPortMock: {
    countActiveLoansForMember: jest.Mock;
  };
  let finePortMock: {
    hasUnpaidFines: jest.Mock;
  };

  const userId = 42;
  const bookId = 101;

  beforeEach(async () => {
    prismaMock = {
      hold: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    loanPortMock = {
      countActiveLoansForMember: jest.fn().mockResolvedValue(0),
    };

    finePortMock = {
      hasUnpaidFines: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberEligibilityPolicy,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ACTIVE_LOAN_COUNT_PORT, useValue: loanPortMock },
        { provide: UNPAID_FINES_PORT, useValue: finePortMock },
      ],
    }).compile();

    policy = module.get<MemberEligibilityPolicy>(MemberEligibilityPolicy);
  });

  describe('Happy path', () => {
    it('passes when member has 0 holds, 0 loans, no fines, and no existing hold on book', async () => {
      await expect(
        policy.assertEligible(userId, bookId),
      ).resolves.toBeUndefined();

      expect(prismaMock.hold.count).toHaveBeenCalledWith({
        where: { userId, status: HoldStatus.ACTIVE },
      });
      expect(loanPortMock.countActiveLoansForMember).toHaveBeenCalledWith(
        userId,
      );
      expect(finePortMock.hasUnpaidFines).toHaveBeenCalledWith(userId);
      expect(prismaMock.hold.findFirst).toHaveBeenCalledWith({
        where: { userId, bookId, status: HoldStatus.ACTIVE },
        select: { id: true },
      });
    });

    it('passes when member has 2 active holds (below MAX_ACTIVE_HOLDS = 3)', async () => {
      prismaMock.hold.count.mockResolvedValue(2);
      await expect(
        policy.assertEligible(userId, bookId),
      ).resolves.toBeUndefined();
    });
  });

  describe('Rule 1: Active holds limit', () => {
    it('throws MaxActiveHoldsReachedError when active holds count equals MAX_ACTIVE_HOLDS (3)', async () => {
      prismaMock.hold.count.mockResolvedValue(MAX_ACTIVE_HOLDS);

      await expect(policy.assertEligible(userId, bookId)).rejects.toThrow(
        MaxActiveHoldsReachedError,
      );

      try {
        await policy.assertEligible(userId, bookId);
      } catch (err: any) {
        expect(err.code).toBe(HoldErrorCode.HOLD_LIMIT_REACHED);
        expect(err.getStatus()).toBe(400);
      }

      // Short-circuit: loan and fine ports must not be contacted
      expect(loanPortMock.countActiveLoansForMember).not.toHaveBeenCalled();
      expect(finePortMock.hasUnpaidFines).not.toHaveBeenCalled();
    });

    it('throws MaxActiveHoldsReachedError when active holds exceed MAX_ACTIVE_HOLDS', async () => {
      prismaMock.hold.count.mockResolvedValue(MAX_ACTIVE_HOLDS + 1);

      await expect(policy.assertEligible(userId, bookId)).rejects.toThrow(
        MaxActiveHoldsReachedError,
      );
    });
  });

  describe('Rule 2: Active loans limit (ActiveLoanCountPort)', () => {
    it('throws MaxActiveLoansReachedError when member has MAX_ACTIVE_LOANS (3)', async () => {
      loanPortMock.countActiveLoansForMember.mockResolvedValue(
        MAX_ACTIVE_LOANS,
      );

      await expect(policy.assertEligible(userId, bookId)).rejects.toThrow(
        MaxActiveLoansReachedError,
      );

      try {
        await policy.assertEligible(userId, bookId);
      } catch (err: any) {
        expect(err.code).toBe(HoldErrorCode.LOAN_LIMIT_REACHED);
        expect(err.getStatus()).toBe(400);
      }

      // Short-circuit: fines port must not be contacted
      expect(finePortMock.hasUnpaidFines).not.toHaveBeenCalled();
    });
  });

  describe('Rule 3: Unpaid fines (UnpaidFinesPort)', () => {
    it('throws UnpaidFinesError when member has unpaid fines', async () => {
      finePortMock.hasUnpaidFines.mockResolvedValue(true);

      await expect(policy.assertEligible(userId, bookId)).rejects.toThrow(
        UnpaidFinesError,
      );

      try {
        await policy.assertEligible(userId, bookId);
      } catch (err: any) {
        expect(err.code).toBe(HoldErrorCode.UNPAID_FINES);
        expect(err.getStatus()).toBe(400);
      }

      // Short-circuit: duplicate hold query must not be executed
      expect(prismaMock.hold.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Rule 4: Duplicate active hold on the same book', () => {
    it('throws DuplicateActiveHoldError when member already has an ACTIVE hold on this book', async () => {
      prismaMock.hold.findFirst.mockResolvedValue({ id: 99 });

      await expect(policy.assertEligible(userId, bookId)).rejects.toThrow(
        DuplicateActiveHoldError,
      );

      try {
        await policy.assertEligible(userId, bookId);
      } catch (err: any) {
        expect(err.code).toBe(HoldErrorCode.ALREADY_HELD);
        expect(err.getStatus()).toBe(409);
      }
    });

    it('passes if member previously held the book but it is no longer ACTIVE', async () => {
      // Prisma findFirst returns null because query specifies status: ACTIVE
      prismaMock.hold.findFirst.mockResolvedValue(null);
      await expect(
        policy.assertEligible(userId, bookId),
      ).resolves.toBeUndefined();
    });
  });

  describe('Default Port Adapters', () => {
    it('DefaultActiveLoanCountAdapter returns 0 active loans', async () => {
      const adapter = new DefaultActiveLoanCountAdapter();
      await expect(adapter.countActiveLoansForMember(userId)).resolves.toBe(0);
    });

    it('DefaultUnpaidFinesAdapter returns false (no unpaid fines)', async () => {
      const adapter = new DefaultUnpaidFinesAdapter();
      await expect(adapter.hasUnpaidFines(userId)).resolves.toBe(false);
    });
  });
});
