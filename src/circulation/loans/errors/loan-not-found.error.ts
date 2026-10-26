import { NotFoundException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class LoanNotFoundError extends NotFoundException {
  readonly code = LoanErrorCode.LOAN_NOT_FOUND;

  constructor(identifier: number | string) {
    super({
      statusCode: 404,
      code: LoanErrorCode.LOAN_NOT_FOUND,
      message: `Loan #${identifier} not found`,
    });
    this.name = 'LoanNotFoundError';
  }
}
