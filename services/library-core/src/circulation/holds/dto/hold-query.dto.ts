import { HoldStatus } from '@prisma/client';

export interface StaffHoldFilter {
  status?: HoldStatus;
  userId?: number;
  bookId?: number;
  expiringBefore?: Date;
}

export interface PaginationArgs {
  skip?: number;
  take?: number;
}
