import { ConflictException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class DuplicateActiveHoldError extends ConflictException {
  readonly code = HoldErrorCode.DUPLICATE_ACTIVE_HOLD;

  constructor(bookId: number) {
    super({
      statusCode: 409,
      code: HoldErrorCode.DUPLICATE_ACTIVE_HOLD,
      message: `Member already has an active hold on book #${bookId}`,
    });
    this.name = 'DuplicateActiveHoldError';
  }
}
