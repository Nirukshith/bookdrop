import { BadRequestException } from '@nestjs/common';
import { FineErrorCode } from './fine-error-codes';

export class InvalidAmountError extends BadRequestException {
  readonly code = FineErrorCode.INVALID_AMOUNT;

  constructor(message: string = 'Invalid monetary amount provided') {
    super({
      statusCode: 400,
      code: FineErrorCode.INVALID_AMOUNT,
      message,
    });
    this.name = 'InvalidAmountError';
  }
}

