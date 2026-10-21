import { BadRequestException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class MaxActiveLoansReachedError extends BadRequestException {
  readonly code = HoldErrorCode.LOAN_LIMIT_REACHED;

  constructor(limit: number) {
    super({
      statusCode: 400,
      code: HoldErrorCode.LOAN_LIMIT_REACHED,
      message: `Member has reached maximum limit of ${limit} active loans`,
    });
    this.name = 'MaxActiveLoansReachedError';
  }
}
