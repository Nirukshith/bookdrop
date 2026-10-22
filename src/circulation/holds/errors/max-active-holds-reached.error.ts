import { BadRequestException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class MaxActiveHoldsReachedError extends BadRequestException {
  readonly code = HoldErrorCode.HOLD_LIMIT_REACHED;

  constructor(limit: number) {
    super({
      statusCode: 400,
      code: HoldErrorCode.HOLD_LIMIT_REACHED,
      message: `Member has reached maximum limit of ${limit} active holds`,
    });
    this.name = 'MaxActiveHoldsReachedError';
  }
}
