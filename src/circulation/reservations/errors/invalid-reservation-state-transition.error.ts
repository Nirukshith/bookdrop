import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class InvalidReservationStateTransitionError extends BadRequestException {
  readonly code = ReservationErrorCode.INVALID_RESERVATION_STATE_TRANSITION;

  constructor(message: string) {
    super({
      statusCode: 400,
      code: ReservationErrorCode.INVALID_RESERVATION_STATE_TRANSITION,
      message,
    });
    this.name = 'InvalidReservationStateTransitionError';
  }
}
