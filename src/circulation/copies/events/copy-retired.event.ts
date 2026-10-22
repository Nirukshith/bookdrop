import { CopyRetiredPayload } from '../../../contracts/events';

export class CopyRetiredEvent implements CopyRetiredPayload {
  static readonly EVENT_NAME = 'copy.retired';
  readonly eventName = CopyRetiredEvent.EVENT_NAME;

  constructor(
    public readonly copyId: number,
    public readonly bookId: number,
    public readonly reason: string,
    public readonly retiredAt: Date,
    public readonly actorId: number | null,
    public readonly occurredAt: Date,
  ) {}
}
