import { CopyStatus } from '@prisma/client';

export class CopyStatusChangedEvent {
  static readonly EVENT_NAME = 'copy.status_changed';

  constructor(
    public readonly copyId: number,
    public readonly bookId: number,
    public readonly fromStatus: CopyStatus,
    public readonly toStatus: CopyStatus,
    public readonly reason: string | null,
    public readonly actorId: number | null,
    public readonly occurredAt: Date,
  ) {}
}
