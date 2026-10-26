import { HoldFulfilledPayload } from '../../../contracts/events';

export class HoldFulfilledEvent implements HoldFulfilledPayload {
  static readonly EVENT_NAME = 'hold.fulfilled';
  readonly eventName = HoldFulfilledEvent.EVENT_NAME;
  readonly domain = 'circulation';

  public readonly holdId: number;
  public readonly loanId?: number;
  public readonly userId?: number;
  public readonly bookId?: number;
  public readonly copyId?: number;
  public readonly fulfilledAt?: Date;

  constructor(
    holdId: number,
    loanIdOrUserId?: number,
    bookId?: number,
    copyId?: number,
    fulfilledAt?: Date,
  ) {
    this.holdId = holdId;
    if (typeof copyId !== 'undefined' || typeof fulfilledAt !== 'undefined') {
      // Legacy signature: (holdId, userId, bookId, copyId, fulfilledAt)
      this.userId = loanIdOrUserId;
      this.bookId = bookId;
      this.copyId = copyId;
      this.fulfilledAt = fulfilledAt ?? new Date();
    } else {
      // Stage 6 signature: (holdId, loanId)
      this.loanId = loanIdOrUserId;
      this.fulfilledAt = new Date();
    }
  }
}
