import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class CopyAvailableError extends BadRequestException {
  readonly code = ReservationErrorCode.COPY_AVAILABLE;

  constructor(readonly bookId?: number) {
    super({
      statusCode: 400,
      code: ReservationErrorCode.COPY_AVAILABLE,
      message: bookId
        ? `A copy of book #${bookId} is currently available; request a hold instead`
        : 'A copy of this book is currently available; request a hold instead',
    });
    this.name = 'CopyAvailableError';
  }
}
