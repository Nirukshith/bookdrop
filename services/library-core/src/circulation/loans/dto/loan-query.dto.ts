import { LoanStatus } from '@prisma/client';

export interface StaffLoanFilter {
  status?: LoanStatus;
  userId?: number;
  bookId?: number;
  overdue?: boolean;
  dueBefore?: Date;
}

export interface PaginationArgs {
  skip?: number;
  take?: number;
}
