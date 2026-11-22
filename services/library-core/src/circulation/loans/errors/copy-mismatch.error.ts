import { BadRequestException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class CopyMismatchError extends BadRequestException {
  readonly code = LoanErrorCode.COPY_MISMATCH;

  constructor(scannedBarcode: string, heldBarcode: string) {
    super({
      statusCode: 400,
      code: LoanErrorCode.COPY_MISMATCH,
      message: `Scanned barcode '${scannedBarcode}' does not match held copy barcode '${heldBarcode}'`,
    });
    this.name = 'CopyMismatchError';
  }
}
