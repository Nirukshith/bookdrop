import { NotFoundException } from '@nestjs/common';
import { LoanErrorCode } from './loan-error-codes';

export class MemberNotFoundError extends NotFoundException {
  readonly code = LoanErrorCode.MEMBER_NOT_FOUND;

  constructor(identifier: number | string) {
    super({
      statusCode: 404,
      code: LoanErrorCode.MEMBER_NOT_FOUND,
      message: `Member '${identifier}' not found`,
    });
    this.name = 'MemberNotFoundError';
  }
}
