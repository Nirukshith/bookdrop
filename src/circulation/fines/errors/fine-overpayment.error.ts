import { BadRequestException } from '@nestjs/common';
import { FineErrorCode } from './fine-error-codes';

export class FineOverpaymentError extends BadRequestException {
  readonly code = FineErrorCode.OVERPAYMENT;

  constructor(amountMinor: number, outstandingMinor: number) {
    super({
      statusCode: 400,
      code: FineErrorCode.OVERPAYMENT,
      message: `Payment amount of ${amountMinor} exceeds the outstanding fine balance of ${outstandingMinor}`,
    });
    this.name = 'FineOverpaymentError';
  }
}
