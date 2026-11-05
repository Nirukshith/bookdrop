import { NotFoundException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class ReservationNotFoundError extends NotFoundException {
  readonly code = ReservationErrorCode.RESERVATION_NOT_FOUND;

  constructor(reservationId: number) {
    super({
      statusCode: 404,
      code: ReservationErrorCode.RESERVATION_NOT_FOUND,
      message: `Reservation #${reservationId} not found`,
    });
    this.name = 'ReservationNotFoundError';
  }
}

