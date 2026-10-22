import { ConflictException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class DuplicateActiveHoldError extends ConflictException {
  readonly code = HoldErrorCode.ALREADY_HELD;

  constructor(bookId: number) {
    super({
      statusCode: 409,
      code: HoldErrorCode.ALREADY_HELD,
      message: `Member already has an active hold on book #${bookId}`,
    });
    this.name = 'DuplicateActiveHoldError';
  }
}
