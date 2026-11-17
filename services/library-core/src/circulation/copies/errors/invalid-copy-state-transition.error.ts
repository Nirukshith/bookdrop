import { BadRequestException } from '@nestjs/common';

export class InvalidCopyStateTransitionError extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCopyStateTransitionError';
  }
}
