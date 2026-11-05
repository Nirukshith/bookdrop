import { BadRequestException } from '@nestjs/common';
import { ReservationErrorCode } from './reservation-error-codes';

export class OverdueLoansError extends BadRequestException {
  readonly code = ReservationErrorCode.OVERDUE_LOANS;

  constructor() {
    super({
      statusCode: 400,
      code: ReservationErrorCode.OVERDUE_LOANS,
      message: 'Member has overdue loans and cannot join the reservation queue',
    });
    this.name = 'OverdueLoansError';
  }
}
