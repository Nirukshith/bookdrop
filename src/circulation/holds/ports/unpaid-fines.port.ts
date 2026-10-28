import { Prisma } from '@prisma/client';

export const UNPAID_FINES_PORT = Symbol('UNPAID_FINES_PORT');

export interface UnpaidFinesPort {
  /**
   * Returns true if the member has any unpaid fines/penalties.
   */
  hasUnpaidFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
}
