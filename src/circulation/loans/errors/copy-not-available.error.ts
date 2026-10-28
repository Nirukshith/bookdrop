import { ConflictException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class CopyNotAvailableError extends ConflictException {
  readonly code = LoanErrorCode.COPY_NOT_AVAILABLE;

  constructor(message: string) {
    super({
      statusCode: 409,
      code: LoanErrorCode.COPY_NOT_AVAILABLE,
      message,
    });
    this.name = 'CopyNotAvailableError';
  }
}
