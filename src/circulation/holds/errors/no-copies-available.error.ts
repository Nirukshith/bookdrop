import { ConflictException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class NoCopiesAvailableError extends ConflictException {
  readonly code = HoldErrorCode.NO_COPY_AVAILABLE;

  constructor(bookId: number) {
    super({
      statusCode: 409,
      code: HoldErrorCode.NO_COPY_AVAILABLE,
      message: `No available copies of book #${bookId} to hold`,
    });
    this.name = 'NoCopiesAvailableError';
  }
}
