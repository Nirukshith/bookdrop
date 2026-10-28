import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UnpaidFinesPort } from './unpaid-fines.port';

/**
 * Default placeholder implementation of UnpaidFinesPort for Stage 6.
 * Always returns false (no unpaid fines).
 *
 * NOTE: Stage 7 (Fines & Fees Module) will replace this placeholder with
 * real queries against the Fines ledger once implemented.
 */
@Injectable()
export class DefaultUnpaidFinesAdapter implements UnpaidFinesPort {
  async hasUnpaidFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    void userId;
    void tx;
    return false;
  }
}
