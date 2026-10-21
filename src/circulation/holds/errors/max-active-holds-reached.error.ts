import { BadRequestException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class MaxActiveHoldsReachedError extends BadRequestException {
  readonly code = HoldErrorCode.MAX_ACTIVE_HOLDS_REACHED;

  constructor(limit: number) {
    super({
      statusCode: 400,
      code: HoldErrorCode.MAX_ACTIVE_HOLDS_REACHED,
      message: `Member has reached maximum limit of ${limit} active holds`,
    });
    this.name = 'MaxActiveHoldsReachedError';
  }
}
