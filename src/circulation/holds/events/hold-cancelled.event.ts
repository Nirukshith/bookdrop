export class HoldCancelledEvent {
  static readonly EVENT_NAME = 'hold.cancelled';

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly cancelledById: number,
    public readonly reason: string | null,
    public readonly cancelledAt: Date,
  ) {}
}
