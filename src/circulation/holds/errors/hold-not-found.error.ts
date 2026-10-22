import { NotFoundException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class HoldNotFoundError extends NotFoundException {
  readonly code = HoldErrorCode.HOLD_NOT_FOUND;

  constructor(id: number) {
    super({
      statusCode: 404,
      code: HoldErrorCode.HOLD_NOT_FOUND,
      message: `Hold #${id} not found`,
    });
    this.name = 'HoldNotFoundError';
  }
}
