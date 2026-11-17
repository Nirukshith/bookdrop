import { HoldExpiredPayload } from '../../../contracts/events';

export class HoldExpiredEvent implements HoldExpiredPayload {
  static readonly EVENT_NAME = 'hold.expired';
  readonly eventName = HoldExpiredEvent.EVENT_NAME;

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly expiredAt?: Date,
  ) {}
}
