import { BadRequestException } from '@nestjs/common';
import { HoldErrorCode } from './hold-error-codes';

export class OverdueLoansError extends BadRequestException {
  readonly code = HoldErrorCode.OVERDUE_LOANS;

  constructor() {
    super({
      statusCode: 400,
      code: HoldErrorCode.OVERDUE_LOANS,
      message: 'Member has overdue loans and cannot request or borrow books',
    });
    this.name = 'OverdueLoansError';
  }
}
