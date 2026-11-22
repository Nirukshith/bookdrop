import { ForbiddenException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { HoldErrorCode } from './hold-error-codes';

const MESSAGES: Record<string, string> = {
  [MembershipStatus.PENDING]:
    'Your membership is awaiting admin approval. You can request holds, join waitlists and borrow books once it is approved.',
  [MembershipStatus.REJECTED]:
    'Your membership application was not approved. Please contact the library to resolve it.',
};

export class MembershipNotApprovedError extends ForbiddenException {
  readonly code = HoldErrorCode.MEMBERSHIP_NOT_APPROVED;

  constructor(readonly membershipStatus: MembershipStatus | null) {
    super({
      statusCode: 403,
      code: HoldErrorCode.MEMBERSHIP_NOT_APPROVED,
      membershipStatus,
      message:
        (membershipStatus && MESSAGES[membershipStatus]) ||
        'Membership is not approved for borrowing',
    });
    this.name = 'MembershipNotApprovedError';
  }
}
