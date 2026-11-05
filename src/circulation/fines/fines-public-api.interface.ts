import { Fine, FineReason, Prisma } from '@prisma/client';

export interface CreateFineInput {
  userId: number;
  reason: FineReason;
  amountMinor: number;
  loanId?: number | null;
  daysLate?: number | null;
  note?: string | null;
  dedupeKey: string;
  createdById?: number | null;
}

export const FINES_PUBLIC_API = Symbol('FINES_PUBLIC_API');

export interface FinesPublicApi {
  /**
   * Idempotently creates a fine.
   * If a fine with dedupeKey exists, returns it without creating a duplicate or emitting events.
   */
  createFine(
    input: CreateFineInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Fine>;

  /**
   * Retrieves all unpaid or partially paid fines for a given member.
   */
  getOutstandingFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Fine[]>;

  /**
   * Computes the total outstanding fine amount in minor units (paise / cents) for a member.
   */
  getOutstandingTotalMinor(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
