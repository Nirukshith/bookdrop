import {
  DOMAIN_EVENT_NAMES,
  ReservationJoinedPayload,
} from '../../../contracts/events';

export class ReservationJoinedEvent implements ReservationJoinedPayload {
  static readonly EVENT_NAME = DOMAIN_EVENT_NAMES.RESERVATION_JOINED;
  readonly eventName = ReservationJoinedEvent.EVENT_NAME;
  readonly domain = 'reservation';

  constructor(
    public readonly reservationId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly position: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
