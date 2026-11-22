import { Prisma } from '@prisma/client';

export const UNPAID_FINES_PORT = Symbol('UNPAID_FINES_PORT');

export type MemberFinesBlockReason = 'UNPAID_FINES' | 'OVERDUE_LOANS';

export interface UnpaidFinesCheckResult {
  blocked: boolean;
  reason?: MemberFinesBlockReason;
}

export interface UnpaidFinesPort {
  /**
   * Evaluates whether a member is blocked from new requests or checkouts
   * due to outstanding unpaid/partially paid fines or actively overdue loans.
   */
  checkMemberFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<UnpaidFinesCheckResult>;

  /**
   * Backward-compatible helper method.
   * Returns true if the member has any unpaid fines/penalties or overdue loans.
   */
  hasUnpaidFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
}
