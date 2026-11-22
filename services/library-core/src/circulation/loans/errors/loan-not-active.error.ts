import { BadRequestException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class LoanNotActiveError extends BadRequestException {
  readonly code = LoanErrorCode.LOAN_NOT_ACTIVE;

  constructor(loanId: number, status?: string) {
    super({
      statusCode: 400,
      code: LoanErrorCode.LOAN_NOT_ACTIVE,
      message: `Loan #${loanId} is not active (current status: '${status ?? 'UNKNOWN'}')`,
    });
    this.name = 'LoanNotActiveError';
  }
}
