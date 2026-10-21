import { BadRequestException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class InvalidHoldStateTransitionError extends BadRequestException {
  readonly code = HoldErrorCode.INVALID_HOLD_STATE_TRANSITION;

  constructor(message: string) {
    super({
      statusCode: 400,
      code: HoldErrorCode.INVALID_HOLD_STATE_TRANSITION,
      message,
    });
    this.name = 'InvalidHoldStateTransitionError';
  }
}
