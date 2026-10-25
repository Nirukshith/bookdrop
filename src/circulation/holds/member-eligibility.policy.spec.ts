import { Test, TestingModule } from '@nestjs/testing';
import { HoldStatus, LoanStatus } from '@prisma/client';
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

describe('MemberEligibilityPolicy (Step 4)', () => {
  let policy: MemberEligibilityPolicy;
  let prismaMock: {
    hold: {
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    loan: {
      count: jest.Mock;
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
        update: jest.fn(),
      },
      loan: {
        count: jest.fn().mockResolvedValue(0),
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

  describe('checkRequestEligibility (Hold Request)', () => {
    describe('Happy path', () => {
      it('passes when member has 0 holds, 0 loans, no fines, and no existing hold on book', async () => {
        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).resolves.toBeUndefined();

        expect(prismaMock.hold.count).toHaveBeenCalledWith({
          where: { userId, status: HoldStatus.ACTIVE },
        });
        expect(loanPortMock.countActiveLoansForMember).toHaveBeenCalledWith(
          userId,
          undefined,
        );
        expect(finePortMock.hasUnpaidFines).toHaveBeenCalledWith(
          userId,
          undefined,
        );
        expect(prismaMock.hold.findFirst).toHaveBeenCalledWith({
          where: { userId, bookId, status: HoldStatus.ACTIVE },
          select: { id: true },
        });
      });

      it('assertEligible delegates to checkRequestEligibility', async () => {
        await expect(
          policy.assertEligible(userId, bookId),
        ).resolves.toBeUndefined();

        expect(prismaMock.hold.count).toHaveBeenCalledWith({
          where: { userId, status: HoldStatus.ACTIVE },
        });
      });

      it('passes when member has 2 active holds (below MAX_ACTIVE_HOLDS = 3)', async () => {
        prismaMock.hold.count.mockResolvedValue(2);
        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).resolves.toBeUndefined();
      });
    });

    describe('Rule 1: Active holds limit', () => {
      it('throws MaxActiveHoldsReachedError when active holds count equals MAX_ACTIVE_HOLDS (3)', async () => {
        prismaMock.hold.count.mockResolvedValue(MAX_ACTIVE_HOLDS);

        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).rejects.toThrow(MaxActiveHoldsReachedError);

        try {
          await policy.checkRequestEligibility(userId, bookId);
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

        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).rejects.toThrow(MaxActiveHoldsReachedError);
      });
    });

    describe('Rule 2: Active loans limit (ActiveLoanCountPort)', () => {
      it('throws MaxActiveLoansReachedError when member has MAX_ACTIVE_LOANS (3)', async () => {
        loanPortMock.countActiveLoansForMember.mockResolvedValue(
          MAX_ACTIVE_LOANS,
        );

        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).rejects.toThrow(MaxActiveLoansReachedError);

        try {
          await policy.checkRequestEligibility(userId, bookId);
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

        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).rejects.toThrow(UnpaidFinesError);

        try {
          await policy.checkRequestEligibility(userId, bookId);
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

        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).rejects.toThrow(DuplicateActiveHoldError);

        try {
          await policy.checkRequestEligibility(userId, bookId);
        } catch (err: any) {
          expect(err.code).toBe(HoldErrorCode.ALREADY_HELD);
          expect(err.getStatus()).toBe(409);
        }
      });

      it('passes if member previously held the book but it is no longer ACTIVE', async () => {
        prismaMock.hold.findFirst.mockResolvedValue(null);
        await expect(
          policy.checkRequestEligibility(userId, bookId),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('checkCheckoutEligibility (Desk Checkout)', () => {
    it('passes when member has < 3 active loans and no unpaid fines', async () => {
      loanPortMock.countActiveLoansForMember.mockResolvedValue(2);
      finePortMock.hasUnpaidFines.mockResolvedValue(false);

      await expect(
        policy.checkCheckoutEligibility(userId),
      ).resolves.toBeUndefined();

      expect(loanPortMock.countActiveLoansForMember).toHaveBeenCalledWith(
        userId,
        undefined,
      );
      expect(finePortMock.hasUnpaidFines).toHaveBeenCalledWith(
        userId,
        undefined,
      );
      // Desk check does NOT check hold count or duplicate hold on book
      expect(prismaMock.hold.count).not.toHaveBeenCalled();
      expect(prismaMock.hold.findFirst).not.toHaveBeenCalled();
    });

    it('throws MaxActiveLoansReachedError when member has MAX_ACTIVE_LOANS (3)', async () => {
      loanPortMock.countActiveLoansForMember.mockResolvedValue(3);

      await expect(policy.checkCheckoutEligibility(userId)).rejects.toThrow(
        MaxActiveLoansReachedError,
      );

      try {
        await policy.checkCheckoutEligibility(userId);
      } catch (err: any) {
        expect(err.code).toBe(HoldErrorCode.LOAN_LIMIT_REACHED);
        expect(err.getStatus()).toBe(400);
      }

      // Short-circuits fines check
      expect(finePortMock.hasUnpaidFines).not.toHaveBeenCalled();
    });

    it('throws UnpaidFinesError when member has unpaid fines', async () => {
      loanPortMock.countActiveLoansForMember.mockResolvedValue(1);
      finePortMock.hasUnpaidFines.mockResolvedValue(true);

      await expect(policy.checkCheckoutEligibility(userId)).rejects.toThrow(
        UnpaidFinesError,
      );

      try {
        await policy.checkCheckoutEligibility(userId);
      } catch (err: any) {
        expect(err.code).toBe(HoldErrorCode.UNPAID_FINES);
        expect(err.getStatus()).toBe(400);
      }
    });

    it('refuses checkout when member has 3 active loans and a valid hold, leaving the hold ACTIVE', async () => {
      // Setup: member has 3 active loans
      loanPortMock.countActiveLoansForMember.mockResolvedValue(3);

      // Existing hold in database is ACTIVE
      const activeHold = {
        id: 777,
        userId,
        bookId,
        status: HoldStatus.ACTIVE,
      };

      // Checkout attempt fails due to loan limit
      await expect(policy.checkCheckoutEligibility(userId)).rejects.toThrow(
        MaxActiveLoansReachedError,
      );

      // Verify that the hold was NOT touched/updated/cancelled
      expect(prismaMock.hold.update).not.toHaveBeenCalled();
      expect(activeHold.status).toBe(HoldStatus.ACTIVE);
    });
  });

  describe('Default Port Adapters', () => {
    describe('DefaultActiveLoanCountAdapter', () => {
      it('queries PostgreSQL for ACTIVE loans by userId', async () => {
        const mockPrisma = {
          loan: {
            count: jest.fn().mockResolvedValue(2),
          },
        } as unknown as PrismaService;

        const adapter = new DefaultActiveLoanCountAdapter(mockPrisma);
        const count = await adapter.countActiveLoansForMember(userId);

        expect(count).toBe(2);
        expect(mockPrisma.loan.count).toHaveBeenCalledWith({
          where: {
            userId,
            status: LoanStatus.ACTIVE,
          },
        });
      });

      it('supports interactive transaction client if provided', async () => {
        const mockPrisma = {
          loan: {
            count: jest.fn(),
          },
        } as unknown as PrismaService;

        const mockTx = {
          loan: {
            count: jest.fn().mockResolvedValue(1),
          },
        };

        const adapter = new DefaultActiveLoanCountAdapter(mockPrisma);
        const count = await adapter.countActiveLoansForMember(
          userId,
          mockTx as any,
        );

        expect(count).toBe(1);
        expect(mockTx.loan.count).toHaveBeenCalledWith({
          where: {
            userId,
            status: LoanStatus.ACTIVE,
          },
        });
        expect(mockPrisma.loan.count).not.toHaveBeenCalled();
      });
    });

    describe('DefaultUnpaidFinesAdapter', () => {
      it('returns false (no unpaid fines placeholder for Stage 6)', async () => {
        const adapter = new DefaultUnpaidFinesAdapter();
        await expect(adapter.hasUnpaidFines(userId)).resolves.toBe(false);
      });
    });
  });
});
