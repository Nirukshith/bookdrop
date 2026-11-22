import { Inject, Injectable } from '@nestjs/common';
import { HoldStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_ACTIVE_HOLDS, MAX_ACTIVE_LOANS } from '../../config/library-rules';
import {
  ACTIVE_LOAN_COUNT_PORT,
  ActiveLoanCountPort,
} from './ports/active-loan-count.port';
import { UNPAID_FINES_PORT, UnpaidFinesPort } from './ports/unpaid-fines.port';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import { assertMembershipApproved } from './membership-approval';
import {
  MaxActiveHoldsReachedError,
  MaxActiveLoansReachedError,
  UnpaidFinesError,
  OverdueLoansError,
  DuplicateActiveHoldError,
} from './errors';

@Injectable()
export class MemberEligibilityPolicy {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACTIVE_LOAN_COUNT_PORT)
    private readonly loanCountPort: ActiveLoanCountPort,
    @Inject(UNPAID_FINES_PORT)
    private readonly unpaidFinesPort: UnpaidFinesPort,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityApi: IdentityPublicApi,
  ) {}

  /**
   * Asserts member eligibility to place a hold on a book in strict priority order (used by requestHold):
   * 0. Membership is APPROVED by an admin (via IdentityPublicApi)
   * 1. Active holds < MAX_ACTIVE_HOLDS (Circulation database)
   * 2. Active loans < MAX_ACTIVE_LOANS (via ActiveLoanCountPort)
   * 3. No unpaid fines (via UnpaidFinesPort)
   * 4. No duplicate ACTIVE hold for the same book (Circulation database)
   *
   * Throws a domain exception with a stable error code if any rule is violated.
   */
  async checkRequestEligibility(
    userId: number,
    bookId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    // 0. Membership approval check
    await assertMembershipApproved(this.identityApi, userId, tx);

    // 1. Active holds check
    const activeHoldsCount = await client.hold.count({
      where: {
        userId,
        status: HoldStatus.ACTIVE,
      },
    });

    if (activeHoldsCount >= MAX_ACTIVE_HOLDS) {
      throw new MaxActiveHoldsReachedError(MAX_ACTIVE_HOLDS);
    }

    // 2. Active loans check (via ActiveLoanCountPort)
    const activeLoansCount = await this.loanCountPort.countActiveLoansForMember(
      userId,
      tx,
    );

    if (activeLoansCount >= MAX_ACTIVE_LOANS) {
      throw new MaxActiveLoansReachedError(MAX_ACTIVE_LOANS);
    }

    // 3. Unpaid fines and overdue loans check (via UnpaidFinesPort)
    const finesCheck = this.unpaidFinesPort.checkMemberFines
      ? await this.unpaidFinesPort.checkMemberFines(userId, tx)
      : {
          blocked: await this.unpaidFinesPort.hasUnpaidFines(userId, tx),
          reason: 'UNPAID_FINES' as const,
        };

    if (finesCheck.blocked) {
      if (finesCheck.reason === 'OVERDUE_LOANS') {
        throw new OverdueLoansError();
      }
      throw new UnpaidFinesError();
    }

    // 4. Duplicate active hold for same book check
    const existingHold = await client.hold.findFirst({
      where: {
        userId,
        bookId,
        status: HoldStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existingHold) {
      throw new DuplicateActiveHoldError(bookId);
    }
  }

  /**
   * Asserts member eligibility for checkout at the desk (used by checkoutHold and checkoutWalkIn):
   * 0. Membership is APPROVED by an admin (via IdentityPublicApi)
   * 1. Active loans < MAX_ACTIVE_LOANS (via ActiveLoanCountPort)
   * 2. No unpaid fines (via UnpaidFinesPort)
   *
   * Note: Holds count and duplicate holds on the book do not restrict checkout.
   */
  async checkCheckoutEligibility(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // 0. Membership approval check
    await assertMembershipApproved(this.identityApi, userId, tx);

    // 1. Active loans check (via ActiveLoanCountPort)
    const activeLoansCount = await this.loanCountPort.countActiveLoansForMember(
      userId,
      tx,
    );

    if (activeLoansCount >= MAX_ACTIVE_LOANS) {
      throw new MaxActiveLoansReachedError(MAX_ACTIVE_LOANS);
    }

    // 2. Unpaid fines and overdue loans check (via UnpaidFinesPort)
    const finesCheck = this.unpaidFinesPort.checkMemberFines
      ? await this.unpaidFinesPort.checkMemberFines(userId, tx)
      : {
          blocked: await this.unpaidFinesPort.hasUnpaidFines(userId, tx),
          reason: 'UNPAID_FINES' as const,
        };

    if (finesCheck.blocked) {
      if (finesCheck.reason === 'OVERDUE_LOANS') {
        throw new OverdueLoansError();
      }
      throw new UnpaidFinesError();
    }
  }

  /**
   * Backwards-compatible alias for checkRequestEligibility.
   */
  async assertEligible(
    userId: number,
    bookId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return this.checkRequestEligibility(userId, bookId, tx);
  }
}
