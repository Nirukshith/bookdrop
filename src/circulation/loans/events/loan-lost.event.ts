import { LoanLostPayload } from '../../../contracts/events';

export class LoanLostEvent implements LoanLostPayload {
  static readonly EVENT_NAME = 'loan.lost';
  readonly eventName = LoanLostEvent.EVENT_NAME;
  readonly domain = 'loan';

  constructor(
    public readonly loanId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

