import { ConflictException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class CopyOnHoldError extends ConflictException {
  readonly code = LoanErrorCode.COPY_ON_HOLD;

  constructor(barcode: string) {
    super({
      statusCode: 409,
      code: LoanErrorCode.COPY_ON_HOLD,
      message: `Copy with barcode '${barcode}' is currently ON_HOLD for another member`,
    });
    this.name = 'CopyOnHoldError';
  }
}
