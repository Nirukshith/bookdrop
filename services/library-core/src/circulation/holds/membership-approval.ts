import { MembershipStatus } from '@prisma/client';
import { IdentityPublicApi } from '../../users';
import { MembershipNotApprovedError } from './errors';

/**
 * Only APPROVED members may place holds, join waitlists or borrow.
 * Self-registered members start PENDING until an admin verifies their
 * membership number. Status is read from Identity on every call (never from
 * the JWT), so an approval takes effect immediately.
 */
export async function assertMembershipApproved(
  identityApi: IdentityPublicApi,
  userId: number,
): Promise<void> {
  const status = await identityApi.getMembershipStatus(userId);
  if (status !== MembershipStatus.APPROVED) {
    throw new MembershipNotApprovedError(status);
  }
}
