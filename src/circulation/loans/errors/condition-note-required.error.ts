import { BadRequestException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class ConditionNoteRequiredError extends BadRequestException {
  readonly code = LoanErrorCode.CONDITION_NOTE_REQUIRED;

  constructor() {
    super({
      statusCode: 400,
      code: LoanErrorCode.CONDITION_NOTE_REQUIRED,
      message: 'A condition note is required when returning a damaged copy',
    });
    this.name = 'ConditionNoteRequiredError';
  }
}
