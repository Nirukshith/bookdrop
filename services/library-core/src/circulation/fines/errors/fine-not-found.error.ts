import { NotFoundException } from '@nestjs/common';
import { FineErrorCode } from './fine-error-codes';

export class FineNotFoundError extends NotFoundException {
  readonly code = FineErrorCode.FINE_NOT_FOUND;

  constructor(fineId: number) {
    super({
      statusCode: 404,
      code: FineErrorCode.FINE_NOT_FOUND,
      message: `Fine #${fineId} not found`,
    });
    this.name = 'FineNotFoundError';
  }
}
