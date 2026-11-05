import { FineReason } from '@prisma/client';
import { FineCreatedPayload } from '../../../contracts/events';

export class FineCreatedEvent implements FineCreatedPayload {
  static readonly EVENT_NAME = 'fine.created';
  readonly eventName = FineCreatedEvent.EVENT_NAME;
  readonly domain = 'fine';

  constructor(
    public readonly fineId: number,
    public readonly userId: number,
    public readonly reason: FineReason,
    public readonly amountMinor: number,
    public readonly loanId?: number | null,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
