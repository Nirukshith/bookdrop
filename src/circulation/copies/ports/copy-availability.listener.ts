import { Prisma } from '@prisma/client';

export const COPY_AVAILABILITY_LISTENER = Symbol('COPY_AVAILABILITY_LISTENER');

export interface CopyAvailabilityListener {
  onCopyAvailable(
    copyId: number,
    bookId: number,
    tx: Prisma.TransactionClient,
    onCommit?: (cb: () => void) => void,
  ): Promise<{ consumed: boolean }>;
}
