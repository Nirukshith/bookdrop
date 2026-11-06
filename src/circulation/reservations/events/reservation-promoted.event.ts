import {
  DOMAIN_EVENT_NAMES,
  ReservationPromotedPayload,
} from '../../../contracts/events';

export class ReservationPromotedEvent implements ReservationPromotedPayload {
  static readonly EVENT_NAME = DOMAIN_EVENT_NAMES.RESERVATION_PROMOTED;
  readonly eventName = ReservationPromotedEvent.EVENT_NAME;
  readonly domain = 'reservation';

  constructor(
    public readonly reservationId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly holdId: number,
    public readonly copyId: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
