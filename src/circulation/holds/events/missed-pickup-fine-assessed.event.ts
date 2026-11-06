import { MissedPickupFineAssessedPayload } from '../../../contracts/events';

export class MissedPickupFineAssessedEvent implements MissedPickupFineAssessedPayload {
  static readonly EVENT_NAME = 'missed_pickup.fine_assessed';
  readonly eventName = MissedPickupFineAssessedEvent.EVENT_NAME;

  constructor(
    public readonly userId: number,
    public readonly fineId: number,
    public readonly holdIds: number[],
    public readonly amountMinor: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
