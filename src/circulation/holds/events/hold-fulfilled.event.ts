export class HoldFulfilledEvent {
  static readonly EVENT_NAME = 'hold.fulfilled';

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly fulfilledAt: Date,
  ) {}
}
