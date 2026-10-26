import { NotFoundException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class MemberNotFoundError extends NotFoundException {
  readonly code = LoanErrorCode.MEMBER_NOT_FOUND;

  constructor(memberId: number) {
    super({
      statusCode: 404,
      code: LoanErrorCode.MEMBER_NOT_FOUND,
      message: `Member #${memberId} not found`,
    });
    this.name = 'MemberNotFoundError';
  }
}
