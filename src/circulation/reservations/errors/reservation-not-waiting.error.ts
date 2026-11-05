import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class ReservationNotWaitingError extends BadRequestException {
  readonly code = ReservationErrorCode.RESERVATION_NOT_WAITING;

  constructor(reservationId: number, status?: string) {
    super({
      statusCode: 400,
      code: ReservationErrorCode.RESERVATION_NOT_WAITING,
      message: `Reservation #${reservationId} is not in WAITING status${
        status ? ` (current status: ${status})` : ''
      }`,
    });
    this.name = 'ReservationNotWaitingError';
  }
}
