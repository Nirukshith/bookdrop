import { Loan } from '@prisma/client';

export const LOANS_PUBLIC_API = Symbol('LOANS_PUBLIC_API');

export interface LoansPublicApi {
  /**
   * Retrieves a single loan by its primary key ID.
   */
  getLoan(id: number): Promise<Loan>;

  /**
   * Retrieves the currently active loan for a physical copy, or null if none.
   */
  getActiveLoanByCopyId(copyId: number): Promise<Loan | null>;
}
