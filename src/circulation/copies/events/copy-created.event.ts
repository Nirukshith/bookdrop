import { CopyStatus } from '@prisma/client';
import { CopyCreatedPayload } from '../../../contracts/events';

export class CopyCreatedEvent implements CopyCreatedPayload {
  static readonly EVENT_NAME = 'copy.created';
  readonly eventName = CopyCreatedEvent.EVENT_NAME;

  constructor(
    public readonly copyId: number,
    public readonly bookId: number,
    public readonly barcode: string,
    public readonly status: CopyStatus,
    public readonly shelfLocation: string | null,
    public readonly actorId: number | null,
    public readonly occurredAt: Date,
  ) {}
}
