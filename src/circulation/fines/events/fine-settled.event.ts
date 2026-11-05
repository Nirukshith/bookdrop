import { FineReason, FineStatus } from '@prisma/client';
import { FineSettledPayload } from '../../../contracts/events';

export class FineSettledEvent implements FineSettledPayload {
  static readonly EVENT_NAME = 'fine.settled';
  readonly eventName = FineSettledEvent.EVENT_NAME;
  readonly domain = 'fine';

  constructor(
    public readonly fineId: number,
    public readonly userId: number,
    public readonly reason: FineReason,
    public readonly status: FineStatus,
    public readonly settledAt: Date,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
