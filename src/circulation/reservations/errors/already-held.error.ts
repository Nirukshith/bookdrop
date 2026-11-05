import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class AlreadyHeldError extends BadRequestException {
  readonly code = ReservationErrorCode.ALREADY_HELD;

  constructor(bookId?: number) {
    super({
      statusCode: 400,
      code: ReservationErrorCode.ALREADY_HELD,
      message: 'Member already has an active hold on this book',
    });
    this.name = 'AlreadyHeldError';
  }
}
