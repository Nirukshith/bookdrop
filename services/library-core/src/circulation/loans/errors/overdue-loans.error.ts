import { BadRequestException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class OverdueLoansError extends BadRequestException {
  readonly code = LoanErrorCode.OVERDUE_LOANS;

  constructor() {
    super({
      statusCode: 400,
      code: LoanErrorCode.OVERDUE_LOANS,
      message: 'Member has overdue loans and cannot request or borrow books',
    });
    this.name = 'OverdueLoansError';
  }
}
