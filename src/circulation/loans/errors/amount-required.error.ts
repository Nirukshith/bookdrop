import { BadRequestException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class AmountRequiredError extends BadRequestException {
  readonly code = LoanErrorCode.AMOUNT_REQUIRED;

  constructor(
    message: string = 'An assessed fee is required because the book has no configured replacement price',
  ) {
    super({
      statusCode: 400,
      code: LoanErrorCode.AMOUNT_REQUIRED,
      message,
    });
    this.name = 'AmountRequiredError';
  }
}
