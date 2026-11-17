import { CancelledBy, HoldCancelledPayload } from '../../../contracts/events';

export class HoldCancelledEvent implements HoldCancelledPayload {
  static readonly EVENT_NAME = 'hold.cancelled';
  readonly eventName = HoldCancelledEvent.EVENT_NAME;

  constructor(
    public readonly holdId: number,
    public readonly cancelledBy: CancelledBy,
    public readonly reason?: string | null,
    public readonly userId?: number,
    public readonly bookId?: number,
    public readonly copyId?: number,
    public readonly cancelledById?: number,
    public readonly cancelledAt?: Date,
  ) {}
}
