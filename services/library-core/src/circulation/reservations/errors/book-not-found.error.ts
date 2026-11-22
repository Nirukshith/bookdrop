import { NotFoundException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class BookNotFoundError extends NotFoundException {
  readonly code = ReservationErrorCode.BOOK_NOT_FOUND;

  constructor(bookId: number) {
    super({
      statusCode: 404,
      code: ReservationErrorCode.BOOK_NOT_FOUND,
      message: `Book #${bookId} not found`,
    });
    this.name = 'BookNotFoundError';
  }
}
