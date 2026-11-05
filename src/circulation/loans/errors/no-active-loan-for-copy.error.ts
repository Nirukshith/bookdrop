import { BadRequestException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class NoActiveLoanForCopyError extends BadRequestException {
  readonly code = LoanErrorCode.NO_ACTIVE_LOAN_FOR_COPY;

  constructor(barcode: string) {
    super({
      statusCode: 400,
      code: LoanErrorCode.NO_ACTIVE_LOAN_FOR_COPY,
      message: `No active loan found for copy barcode '${barcode}'`,
    });
    this.name = 'NoActiveLoanForCopyError';
  }
}
