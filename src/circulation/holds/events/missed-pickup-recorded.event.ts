import { MissedPickupRecordedPayload } from '../../../contracts/events';

export class MissedPickupRecordedEvent implements MissedPickupRecordedPayload {
  static readonly EVENT_NAME = 'missed_pickup.recorded';
  readonly eventName = MissedPickupRecordedEvent.EVENT_NAME;

  constructor(
    public readonly userId: number,
    public readonly holdId: number,
    public readonly excused: boolean,
    public readonly unassessedCount: number,
    public readonly threshold: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
