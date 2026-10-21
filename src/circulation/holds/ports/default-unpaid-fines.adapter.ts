import { Injectable } from '@nestjs/common';
import { UnpaidFinesPort } from './unpaid-fines.port';

/**
 * Default placeholder implementation of UnpaidFinesPort.
 * Always returns false (no unpaid fines).
 *
 * NOTE: Stage 7 (Fines & Fees Module) will replace this placeholder with
 * real queries against the Fines ledger once implemented.
 */
@Injectable()
export class DefaultUnpaidFinesAdapter implements UnpaidFinesPort {
  async hasUnpaidFines(userId: number): Promise<boolean> {
    void userId;
    return false;
  }
}
