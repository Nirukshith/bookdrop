import { NotFoundException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class CopyNotFoundError extends NotFoundException {
  readonly code = LoanErrorCode.COPY_NOT_FOUND;

  constructor(identifier: string | number) {
    super({
      statusCode: 404,
      code: LoanErrorCode.COPY_NOT_FOUND,
      message: `Copy '${identifier}' not found`,
    });
    this.name = 'CopyNotFoundError';
  }
}
