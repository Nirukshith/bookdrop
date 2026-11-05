import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  HoldSource,
  HoldStatus,
  Prisma,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import {
  BOOK_RESERVATION_ADVISORY_NAMESPACE,
  MEMBER_ADVISORY_NAMESPACE,
  computePickupDeadline,
} from '../../config/library-rules';
import { MemberEligibilityPolicy } from '../holds/member-eligibility.policy';
import { HoldCreatedEvent } from '../holds/events';
import { CopiesService } from '../copies/copies.service';
import {
  COPY_AVAILABILITY_LISTENER,
  CopyAvailabilityListener,
} from '../copies/ports';
import { ReservationPromotedEvent } from './events';

@Injectable()
export class PromotionService implements CopyAvailabilityListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => MemberEligibilityPolicy))
    private readonly eligibilityPolicy: MemberEligibilityPolicy,
    @Inject(forwardRef(() => CopiesService))
    private readonly copiesService: CopiesService,
  ) {}

  /**
   * Implements CopyAvailabilityListener interface.
   */
  async onCopyAvailable(
    copyId: number,
    bookId: number,
    tx: Prisma.TransactionClient,
    onCommit?: (cb: () => void) => void,
  ): Promise<{ consumed: boolean }> {
    const result = await this.promoteNextForBook(copyId, bookId, tx, onCommit);
    return { consumed: result.consumed };
  }

  /**
   * Offers an available copy of a book to the reservation queue.
   * Promotes the first ELIGIBLE waiting member in FIFO order.
   * Ineligible members are skipped and keep their WAITING place.
   */
  async promoteNextForBook(
    copyId: number,
    bookId: number,
    tx: Prisma.TransactionClient,
    onCommit?: (cb: () => void) => void,
  ): Promise<{
    consumed: boolean;
    holdId?: number;
    reservationId?: number;
    userId?: number;
  }> {
    // 1. Acquire per-book reservation advisory lock
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOK_RESERVATION_ADVISORY_NAMESPACE}::int, ${bookId}::int)`;

    // 2. Query candidate WAITING reservations for this book ordered by id ASC
    const candidates = await tx.reservation.findMany({
      where: {
        bookId,
        status: ReservationStatus.WAITING,
      },
      orderBy: { id: 'asc' },
    });

    // 3. Loop over candidates in FIFO order
    for (const c of candidates) {
      // a & b. Acquire member advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_ADVISORY_NAMESPACE}::int, ${c.userId}::int)`;

      // c. Re-read candidate reservation FOR UPDATE
      const rows = await tx.$queryRaw<Reservation[]>`
        SELECT * FROM "Reservation"
        WHERE "id" = ${c.id}
        FOR UPDATE
      `;
      const locked = rows[0];
      if (!locked || locked.status !== ReservationStatus.WAITING) {
        continue;
      }

      // e. Check eligibility against current standing
      try {
        await this.eligibilityPolicy.checkRequestEligibility(
          c.userId,
          bookId,
          tx,
        );
      } catch {
        // INELIGIBLE MEMBERS ARE SKIPPED AND KEEP THEIR WAITING PLACE.
        continue;
      }

      // f. Found an eligible member!
      const now = this.clockService.now();
      const expiresAt = computePickupDeadline(now);

      // Transition copy status: AVAILABLE -> ON_HOLD
      await this.copiesService.transitionStatus(
        copyId,
        [CopyStatus.AVAILABLE],
        CopyStatus.ON_HOLD,
        {
          reason: `Promotion from reservation #${c.id}`,
          changedById: null,
          skipPromotion: true,
        },
        tx,
      );

      // Create Hold record
      const createdHold = await tx.hold.create({
        data: {
          userId: c.userId,
          bookId,
          copyId,
          status: HoldStatus.ACTIVE,
          source: HoldSource.QUEUE_PROMOTION,
          expiresAt,
          createdAt: now,
        },
        include: { copy: true },
      });

      // Update Reservation: status -> PROMOTED, promotedAt, holdId
      await tx.reservation.update({
        where: { id: c.id },
        data: {
          status: ReservationStatus.PROMOTED,
          promotedAt: now,
          holdId: createdHold.id,
        },
      });

      // Events post-commit
      const emitEvents = () => {
        this.eventEmitter.emit(
          HoldCreatedEvent.EVENT_NAME,
          new HoldCreatedEvent(
            createdHold.id,
            createdHold.userId,
            createdHold.bookId,
            createdHold.copyId,
            expiresAt,
            now,
          ),
        );

        this.eventEmitter.emit(
          ReservationPromotedEvent.EVENT_NAME,
          new ReservationPromotedEvent(
            c.id,
            c.userId,
            bookId,
            createdHold.id,
            copyId,
            now,
          ),
        );
      };

      if (onCommit) {
        onCommit(emitEvents);
      } else {
        emitEvents();
      }

      return {
        consumed: true,
        holdId: createdHold.id,
        reservationId: c.id,
        userId: c.userId,
      };
    }

    // 4. Exhausted with no eligible waiting patron; leave copy AVAILABLE
    return { consumed: false };
  }
}
