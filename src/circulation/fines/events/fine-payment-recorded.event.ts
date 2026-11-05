import { FinePaymentRecordedPayload } from '../../../contracts/events';

export class FinePaymentRecordedEvent implements FinePaymentRecordedPayload {
  static readonly EVENT_NAME = 'fine.payment_recorded';
  readonly eventName = FinePaymentRecordedEvent.EVENT_NAME;
  readonly domain = 'fine';

  constructor(
    public readonly fineId: number,
    public readonly paymentId: number,
    public readonly userId: number,
    public readonly amountMinor: number,
    public readonly paidMinor: number,
    public readonly remainingMinor: number,
    public readonly receivedById: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
