import { MembershipStatus, Role } from '@prisma/client';

export const IDENTITY_PUBLIC_API = Symbol('IDENTITY_PUBLIC_API');

export interface MemberDto {
  id: number;
  name: string;
  email: string;
  role: Role;
  membershipStatus: MembershipStatus;
}

export interface IdentityPublicApi {
  findMemberByEmail(email: string): Promise<MemberDto | null>;
  getMembersByIds(ids: number[]): Promise<MemberDto[]>;
  /**
   * Returns the member's current membership approval status, or null if the
   * user does not exist. Read fresh on every call (never from the JWT) so an
   * approval takes effect immediately.
   */
  getMembershipStatus(userId: number): Promise<MembershipStatus | null>;
}
