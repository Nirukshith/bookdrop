import { LoanDueSoonPayload } from '../../../contracts/events';

export class LoanDueSoonEvent implements LoanDueSoonPayload {
  static readonly EVENT_NAME = 'loan.due_soon';
  readonly eventName = LoanDueSoonEvent.EVENT_NAME;

  constructor(
    public readonly loanId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly dueAt: Date,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

