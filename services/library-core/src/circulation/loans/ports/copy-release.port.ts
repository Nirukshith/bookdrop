import { Prisma } from '@prisma/client';

export const COPY_RELEASE_PORT = Symbol('COPY_RELEASE_PORT');

/**
 * Port for releasing a physical copy after a loan is returned in GOOD condition.
 *
 * NOTE FOR STAGE 8:
 * The default implementation transitions the copy from BORROWED to AVAILABLE.
 * In Stage 8 (Reservation Queues), this port will be replaced by a queue-aware adapter:
 * "promote the first member in the reservation queue (copy becomes ON_HOLD for them),
 * otherwise make the copy available".
 */
export interface CopyReleasePort {
  release(
    copyId: number,
    tx: Prisma.TransactionClient,
    onCommit?: (cb: () => void) => void,
  ): Promise<void>;
}
