import { ConflictException } from '@nestjs/common';

export class CopyStatusConflictError extends ConflictException {
  constructor(message: string) {
    super(message);
    this.name = 'CopyStatusConflictError';
  }
}
