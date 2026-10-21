export class CopyRetiredEvent {
  static readonly EVENT_NAME = 'copy.retired';

  constructor(
    public readonly copyId: number,
    public readonly bookId: number,
    public readonly reason: string,
    public readonly retiredAt: Date,
    public readonly actorId: number | null,
    public readonly occurredAt: Date,
  ) {}
}
