import { ReturnCondition } from '@prisma/client';
import { LoanReturnedPayload } from '../../../contracts/events';

export class LoanReturnedEvent implements LoanReturnedPayload {
  static readonly EVENT_NAME = 'loan.returned';
  readonly eventName = LoanReturnedEvent.EVENT_NAME;
  readonly domain = 'loan';

  constructor(
    public readonly loanId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly copyId: number,
    public readonly returnedAt: Date,
    public readonly daysLate: number,
    public readonly condition: ReturnCondition,
    public readonly occurredAt: Date = new Date(),
  ) { }
}

