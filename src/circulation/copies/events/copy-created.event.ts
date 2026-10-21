import { CopyStatus } from '@prisma/client';

export class CopyCreatedEvent {
  static readonly EVENT_NAME = 'copy.created';

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
