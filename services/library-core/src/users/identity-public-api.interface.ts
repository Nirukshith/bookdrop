import { MembershipStatus, Prisma, Role } from '@prisma/client';

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
   *
   * Pass `tx` when called inside a transaction so the read uses that
   * transaction's connection instead of taking a second one from the pool
   * (which can exhaust the pool under concurrent requests).
   */
  getMembershipStatus(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<MembershipStatus | null>;
}
