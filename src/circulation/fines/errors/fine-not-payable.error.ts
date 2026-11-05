import { BadRequestException } from '@nestjs/common';
import { FineErrorCode } from './fine-error-codes';

export class FineNotPayableError extends BadRequestException {
  readonly code = FineErrorCode.FINE_NOT_PAYABLE;

  constructor(fineId: number, status: string) {
    super({
      statusCode: 400,
      code: FineErrorCode.FINE_NOT_PAYABLE,
      message: `Fine #${fineId} cannot be modified because it is in status '${status}'`,
    });
    this.name = 'FineNotPayableError';
  }
}
