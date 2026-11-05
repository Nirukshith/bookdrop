import { Loan, ReturnCondition } from '@prisma/client';

export interface ReturnLoanInput {
  copyBarcode: string;
  condition: ReturnCondition;
  conditionNote?: string;
  damageFeeRs?: number;
  damageFeeMinor?: number;
  staffId: number;
}

export interface MarkLoanLostInput {
  loanId: number;
  assessedFeeRs?: number;
  assessedFeeMinor?: number;
  note: string;
  staffId: number;
}

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

  /**
   * Returns an active loan for a physical copy.
   */
  returnLoan(input: ReturnLoanInput): Promise<Loan>;

  /**
   * Marks an active loan as lost, assessing replacement fee.
   */
  markLoanLost(input: MarkLoanLostInput): Promise<Loan>;
}
