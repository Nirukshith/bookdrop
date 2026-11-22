import { HoldCreatedPayload } from '../../../contracts/events';

export class HoldCreatedEvent implements HoldCreatedPayload {
  static readonly EVENT_NAME = 'hold.created';
  readonly eventName = HoldCreatedEvent.EVENT_NAME;

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly expiresAt: Date,
    public readonly createdAt?: Date,
  ) {}
}
