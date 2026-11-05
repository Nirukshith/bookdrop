import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class AlreadyQueuedError extends BadRequestException {
  readonly code = ReservationErrorCode.ALREADY_QUEUED;

  constructor(readonly bookId?: number) {
    super({
      statusCode: 400,
      code: ReservationErrorCode.ALREADY_QUEUED,
      message: bookId
        ? `Member already has an active reservation for book #${bookId}`
        : 'Member already has an active reservation for this book',
    });
    this.name = 'AlreadyQueuedError';
  }
}
