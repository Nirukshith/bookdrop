import { HoldFulfilledPayload } from '../../../contracts/events';

export class HoldFulfilledEvent implements HoldFulfilledPayload {
  static readonly EVENT_NAME = 'hold.fulfilled';
  readonly eventName = HoldFulfilledEvent.EVENT_NAME;

  constructor(
    public readonly holdId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly fulfilledAt: Date,
  ) {}
}
