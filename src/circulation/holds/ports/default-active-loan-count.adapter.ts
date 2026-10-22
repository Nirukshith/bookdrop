import { Injectable } from '@nestjs/common';
import { ActiveLoanCountPort } from './active-loan-count.port';

/**
 * Default placeholder implementation of ActiveLoanCountPort.
 * Always returns 0 active loans for any member.
 *
 * NOTE: Stage 6 (Loans Module) will replace this placeholder with real
 * database queries against the Loans table once implemented.
 */
@Injectable()
export class DefaultActiveLoanCountAdapter implements ActiveLoanCountPort {
  async countActiveLoansForMember(userId: number): Promise<number> {
    void userId;
    return 0;
  }
}
