import { Hold, Prisma } from '@prisma/client';

export const HOLDS_PUBLIC_API = Symbol('HOLDS_PUBLIC_API');

export interface HoldsPublicApi {
  /**
   * Fulfills an active hold upon loan creation (used by Stage 6 Loans).
   * Does NOT modify the copy status (Loans transitions copy to BORROWED).
   */
  fulfillHold(holdId: number, tx?: Prisma.TransactionClient): Promise<Hold>;

  /**
   * Retrieves a single hold by its unique identifier.
   */
  getHold(id: number): Promise<Hold>;
}
