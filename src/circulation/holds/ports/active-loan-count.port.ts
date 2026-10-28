import { Prisma } from '@prisma/client';

export const ACTIVE_LOAN_COUNT_PORT = Symbol('ACTIVE_LOAN_COUNT_PORT');

export interface ActiveLoanCountPort {
  /**
   * Returns the count of currently active (non-returned) loans for a member.
   */
  countActiveLoansForMember(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
