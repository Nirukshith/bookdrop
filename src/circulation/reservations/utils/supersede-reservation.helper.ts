import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  Reservation,
  ReservationCancelReason,
  ReservationStatus,
} from '@prisma/client';
import { ClockService } from '../../../common/clock/clock.service';
import { ReservationCancelledEvent } from '../events/reservation-cancelled.event';

/**
 * Cancels any active WAITING reservation for a member on the given book with SUPERSEDED reason.
 * Executed inside an existing transaction client (e.g. during hold request or walk-in checkout).
 */
export async function cancelWaitingForUserAndBook(
  tx: Prisma.TransactionClient,
  userId: number,
  bookId: number,
  clockService: ClockService,
  eventEmitter: EventEmitter2,
  reason: ReservationCancelReason = ReservationCancelReason.SUPERSEDED,
  actorId?: number,
  onCommit?: (cb: () => void) => void,
): Promise<Reservation | null> {
  if (!tx.reservation) {
    return null;
  }

  const waiting = await tx.reservation.findFirst({
    where: {
      userId,
      bookId,
      status: ReservationStatus.WAITING,
    },
  });

  if (!waiting) {
    return null;
  }

  const now = clockService.now();
  const updated = await tx.reservation.update({
    where: { id: waiting.id },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: now,
      cancelReason: reason,
      cancelledById: actorId ?? userId,
    },
  });

  const emitCb = () => {
    eventEmitter.emit(
      ReservationCancelledEvent.EVENT_NAME,
      new ReservationCancelledEvent(
        updated.id,
        updated.userId,
        updated.bookId,
        updated.cancelReason!,
        updated.cancelledById,
        updated.cancelledAt!,
      ),
    );
  };

  if (onCommit) {
    onCommit(emitCb);
  } else {
    emitCb();
  }

  return updated;
}
