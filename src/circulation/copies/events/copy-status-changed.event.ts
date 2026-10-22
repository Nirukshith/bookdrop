import { CopyStatus } from '@prisma/client';
import { CopyStatusChangedPayload } from '../../../contracts/events';

export class CopyStatusChangedEvent implements CopyStatusChangedPayload {
  static readonly EVENT_NAME = 'copy.status_changed';
  readonly eventName = CopyStatusChangedEvent.EVENT_NAME;

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
