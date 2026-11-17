import { BadRequestException } from '@nestjs/common';
import { FineErrorCode } from './fine-error-codes';

export class InvalidFineStateTransitionError extends BadRequestException {
  readonly code = FineErrorCode.INVALID_FINE_TRANSITION;

  constructor(message: string) {
    super({
      statusCode: 400,
      code: FineErrorCode.INVALID_FINE_TRANSITION,
      message,
    });
    this.name = 'InvalidFineStateTransitionError';
  }
}
