export class HoldCreatedEvent {
  static readonly EVENT_NAME = 'hold.created';

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
  ) {}
}
