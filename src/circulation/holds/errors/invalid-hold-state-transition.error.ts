import { BadRequestException } from '@nestjs/common';

export class InvalidHoldStateTransitionError extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHoldStateTransitionError';
  }
}
