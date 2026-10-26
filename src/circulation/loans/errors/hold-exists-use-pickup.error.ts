import { ConflictException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class HoldExistsUsePickupError extends ConflictException {
  readonly code = LoanErrorCode.HOLD_EXISTS_USE_PICKUP;

  constructor(memberId: number, bookId: number, holdId: number) {
    super({
      statusCode: 409,
      code: LoanErrorCode.HOLD_EXISTS_USE_PICKUP,
      message: `Member #${memberId} already has an ACTIVE hold (#${holdId}) on book #${bookId}. Confirm pickup instead.`,
    });
    this.name = 'HoldExistsUsePickupError';
  }
}
