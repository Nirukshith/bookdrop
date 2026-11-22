import { ConflictException } from '@nestjs/common';

export class DuplicateBarcodeError extends ConflictException {
  constructor(barcode: string) {
    super(`Copy with barcode '${barcode}' already exists.`);
    this.name = 'DuplicateBarcodeError';
  }
}
