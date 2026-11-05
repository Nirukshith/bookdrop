import { Injectable } from '@nestjs/common';
import { CopyStatus, Prisma } from '@prisma/client';
import { CopiesService } from '../../copies/copies.service';
import { CopyReleasePort } from './copy-release.port';

/**
 * Default copy release adapter for Stage 7.
 * Transitions copy from BORROWED to AVAILABLE via CopiesService.transitionStatus inside tx.
 *
 * NOTE FOR STAGE 8:
 * In Stage 8 (Reservation Queues), this adapter will be replaced with:
 * "promote the first member in the reservation queue (copy becomes ON_HOLD for them),
 * otherwise make the copy available".
 */
@Injectable()
export class DefaultCopyReleaseAdapter implements CopyReleasePort {
  constructor(private readonly copiesService: CopiesService) {}

  async release(copyId: number, tx: Prisma.TransactionClient): Promise<void> {
    await this.copiesService.transitionStatus(
      copyId,
      [CopyStatus.BORROWED],
      CopyStatus.AVAILABLE,
      { reason: 'Loan returned in good condition' },
      tx,
    );
  }
}
