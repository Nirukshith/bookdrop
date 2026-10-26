export type LoanSource = 'HOLD' | 'WALK_IN';

export class LoanCreatedEvent {
  static readonly EVENT_NAME = 'loan.created';

  readonly eventName = LoanCreatedEvent.EVENT_NAME;
  readonly domain = 'circulation';

  constructor(
    public readonly loanId: number,
    public readonly userId: number,
    public readonly copyId: number,
    public readonly bookId: number,
    public readonly borrowedAt: Date,
    public readonly dueAt: Date,
    public readonly source: LoanSource,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
