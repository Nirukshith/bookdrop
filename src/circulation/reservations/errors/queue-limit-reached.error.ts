import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class QueueLimitReachedError extends BadRequestException {
  readonly code = ReservationErrorCode.QUEUE_LIMIT_REACHED;

  constructor(maxReservations: number = 5) {
    super({
      statusCode: 400,
      code: ReservationErrorCode.QUEUE_LIMIT_REACHED,
      message: `Member has reached the maximum of ${maxReservations} active reservations`,
    });
    this.name = 'QueueLimitReachedError';
  }
}

