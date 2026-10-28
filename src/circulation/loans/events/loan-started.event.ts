import { LoanSource, LoanStartedPayload } from '../../../contracts/events';

export class LoanStartedEvent implements LoanStartedPayload {
  static readonly EVENT_NAME = 'loan.started';
  readonly eventName = LoanStartedEvent.EVENT_NAME;
  readonly domain = 'loan';

  constructor(
    public readonly loanId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly borrowedAt: Date,
    public readonly dueAt: Date,
    public readonly source: LoanSource,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

export type { LoanSource };
