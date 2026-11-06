import { ReservationCancelReason } from '@prisma/client';
import {
  DOMAIN_EVENT_NAMES,
  ReservationCancelledPayload,
} from '../../../contracts/events';

export class ReservationCancelledEvent implements ReservationCancelledPayload {
  static readonly EVENT_NAME = DOMAIN_EVENT_NAMES.RESERVATION_CANCELLED;
  readonly eventName = ReservationCancelledEvent.EVENT_NAME;
  readonly domain = 'reservation';

  constructor(
    public readonly reservationId: number,
    public readonly userId: number,
    public readonly bookId: number,
    public readonly reason: ReservationCancelReason | string,
    public readonly cancelledById?: number | null,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
