import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class UnpaidFinesError extends BadRequestException {
  readonly code = ReservationErrorCode.UNPAID_FINES;

  constructor() {
    super({
      statusCode: 400,
      code: ReservationErrorCode.UNPAID_FINES,
      message:
        'Member has outstanding unpaid fines and cannot join the reservation queue',
    });
    this.name = 'UnpaidFinesError';
  }
}
