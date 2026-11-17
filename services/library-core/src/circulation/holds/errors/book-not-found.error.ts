import { NotFoundException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class BookNotFoundError extends NotFoundException {
  readonly code = HoldErrorCode.BOOK_NOT_FOUND;

  constructor(bookId: number) {
    super({
      statusCode: 404,
      code: HoldErrorCode.BOOK_NOT_FOUND,
      message: `Book #${bookId} not found in catalog`,
    });
    this.name = 'BookNotFoundError';
  }
}
