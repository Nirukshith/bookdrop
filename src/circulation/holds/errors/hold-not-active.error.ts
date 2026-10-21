import { ConflictException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class HoldNotActiveError extends ConflictException {
  readonly code = HoldErrorCode.HOLD_NOT_ACTIVE;

  constructor(holdId: number, currentStatus: string) {
    super({
      statusCode: 409,
      code: HoldErrorCode.HOLD_NOT_ACTIVE,
      message: `Hold #${holdId} is not in ACTIVE status (current: ${currentStatus})`,
    });
    this.name = 'HoldNotActiveError';
  }
}
