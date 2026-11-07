import { HoldExpiringSoonPayload } from '../../../contracts/events';

export class HoldExpiringSoonEvent implements HoldExpiringSoonPayload {
  static readonly EVENT_NAME = 'hold.expiring_soon';
  readonly eventName = HoldExpiringSoonEvent.EVENT_NAME;

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly expiresAt: Date,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
