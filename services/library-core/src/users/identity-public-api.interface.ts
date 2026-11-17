import { Role } from '@prisma/client';

export const IDENTITY_PUBLIC_API = Symbol('IDENTITY_PUBLIC_API');

export interface MemberDto {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface IdentityPublicApi {
  findMemberByEmail(email: string): Promise<MemberDto | null>;
  getMembersByIds(ids: number[]): Promise<MemberDto[]>;
}
