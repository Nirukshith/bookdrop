import { BadRequestException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class UnpaidFinesError extends BadRequestException {
  readonly code = HoldErrorCode.UNPAID_FINES;

  constructor() {
    super({
      statusCode: 400,
      code: HoldErrorCode.UNPAID_FINES,
      message: 'Member has outstanding unpaid fines and cannot place a hold',
    });
    this.name = 'UnpaidFinesError';
  }
}
