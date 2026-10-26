import { ConflictException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class HoldExpiredError extends ConflictException {
  readonly code = LoanErrorCode.HOLD_EXPIRED;

  constructor(holdId: number, expiredAt: Date) {
    super({
      statusCode: 409,
      code: LoanErrorCode.HOLD_EXPIRED,
      message: `Hold #${holdId} expired at ${expiredAt.toISOString()}`,
    });
    this.name = 'HoldExpiredError';
  }
}
