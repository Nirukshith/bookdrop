export class HoldExpiredEvent {
  static readonly EVENT_NAME = 'hold.expired';

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly expiredAt: Date,
  ) {}
}
