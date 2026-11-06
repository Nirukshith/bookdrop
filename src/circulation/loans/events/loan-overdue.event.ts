import { LoanOverduePayload } from '../../../contracts/events';

export class LoanOverdueEvent implements LoanOverduePayload {
  static readonly EVENT_NAME = 'loan.overdue';
  readonly eventName = LoanOverdueEvent.EVENT_NAME;

  constructor(
    public readonly loanId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly dueAt: Date,
    public readonly daysLate: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
