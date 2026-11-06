import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  HoldStatus,
  Prisma,
  Reservation,
  ReservationCancelReason,
  ReservationStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { CATALOG_PUBLIC_API, CatalogPublicApi } from '../../books';
import {
  UNPAID_FINES_PORT,
  UnpaidFinesPort,
} from '../holds/ports/unpaid-fines.port';
import {
  BOOK_RESERVATION_ADVISORY_NAMESPACE,
  MAX_ACTIVE_RESERVATIONS,
  MEMBER_ADVISORY_NAMESPACE,
} from '../../config/library-rules';
import { withTransactionRetry } from '../../common/database';
import { assertValidReservationTransition } from './reservation-state-machine';
import {
  AlreadyHeldError,
  AlreadyQueuedError,
  BookNotFoundError,
  CopyAvailableError,
  OverdueLoansError,
  QueueLimitReachedError,
  ReservationNotFoundError,
  ReservationNotWaitingError,
  UnpaidFinesError,
} from './errors';
import { ReservationCancelledEvent, ReservationJoinedEvent } from './events';
import { cancelWaitingForUserAndBook } from './utils/supersede-reservation.helper';

const INTERACTIVE_TX_OPTIONS = {
  maxWait: 15000,
  timeout: 20000,
};

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CATALOG_PUBLIC_API)
    private readonly catalogPublicApi: CatalogPublicApi,
    @Inject(UNPAID_FINES_PORT)
    private readonly unpaidFinesPort: UnpaidFinesPort,
  ) {}

  /**
   * Joins the reservation queue for a book if no copies are available and patron is eligible.
   */
  async joinQueue(
    userId: number,
    bookId: number,
  ): Promise<Reservation & { position: number }> {
    return await withTransactionRetry(async ({ onCommit }) => {
      return this.prisma.$transaction(async (tx) => {
        // 1. Acquire member advisory lock first
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_ADVISORY_NAMESPACE}::int, ${userId}::int)`;

        // 2. Verify book exists via CatalogPublicApi (boundary rule)
        const book = await this.catalogPublicApi.findBookById(bookId);
        if (!book) {
          throw new BookNotFoundError(bookId);
        }

        // 3. Acquire per-book reservation advisory lock
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOK_RESERVATION_ADVISORY_NAMESPACE}::int, ${bookId}::int)`;

        // 4. Verify no copy is currently AVAILABLE for this book
        const availableCount = await tx.copy.count({
          where: {
            bookId,
            status: CopyStatus.AVAILABLE,
            retiredAt: null,
          },
        });
        if (availableCount > 0) {
          throw new CopyAvailableError(bookId);
        }

        // 5. Verify member does not already have an ACTIVE hold on this book
        const existingHold = await tx.hold.findFirst({
          where: {
            userId,
            bookId,
            status: HoldStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (existingHold) {
          throw new AlreadyHeldError(bookId);
        }

        // 6. Verify member does not already have a WAITING reservation for this book
        const existingReservation = await tx.reservation.findFirst({
          where: {
            userId,
            bookId,
            status: ReservationStatus.WAITING,
          },
          select: { id: true },
        });
        if (existingReservation) {
          throw new AlreadyQueuedError(bookId);
        }

        // 7. Check member's active WAITING count against MAX_ACTIVE_RESERVATIONS
        const activeCount = await tx.reservation.count({
          where: {
            userId,
            status: ReservationStatus.WAITING,
          },
        });
        if (activeCount >= MAX_ACTIVE_RESERVATIONS) {
          throw new QueueLimitReachedError(MAX_ACTIVE_RESERVATIONS);
        }

        // 8. Check member's standing: unpaid fines and overdue loans block joining
        const finesCheck = await this.unpaidFinesPort.checkMemberFines(
          userId,
          tx,
        );
        if (finesCheck.blocked) {
          if (finesCheck.reason === 'OVERDUE_LOANS') {
            throw new OverdueLoansError();
          }
          throw new UnpaidFinesError();
        }

        // 9. Insert Reservation with status WAITING
        const createdAt = this.clockService.now();
        const created = await tx.reservation.create({
          data: {
            userId,
            bookId,
            status: ReservationStatus.WAITING,
            createdAt,
          },
        });

        // 10. Compute member's 1-based position in queue
        const position = await tx.reservation.count({
          where: {
            bookId,
            status: ReservationStatus.WAITING,
            id: { lte: created.id },
          },
        });

        // 11. Emit domain event strictly post-commit
        onCommit(() => {
          this.eventEmitter.emit(
            ReservationJoinedEvent.EVENT_NAME,
            new ReservationJoinedEvent(
              created.id,
              created.userId,
              created.bookId,
              position,
              created.createdAt,
            ),
          );
        });

        return {
          ...created,
          position,
        };
      }, INTERACTIVE_TX_OPTIONS);
    });
  }

  /**
   * Leaves (cancels) an active WAITING reservation.
   */
  async leaveQueue(
    reservationId: number,
    actor: { id: number; role: Role },
    reason?: ReservationCancelReason,
  ): Promise<Reservation> {
    const existing = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!existing) {
      throw new ReservationNotFoundError(reservationId);
    }

    if (actor.role === Role.MEMBER && existing.userId !== actor.id) {
      throw new ForbiddenException('You can only cancel your own reservations');
    }

    const finalReason =
      reason ??
      (actor.role === Role.MEMBER
        ? ReservationCancelReason.MEMBER
        : ReservationCancelReason.STAFF);

    return await withTransactionRetry(async ({ onCommit }) => {
      return this.prisma.$transaction(async (tx) => {
        // 1. Acquire member advisory lock first
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_ADVISORY_NAMESPACE}::int, ${existing.userId}::int)`;

        // 2. Lock reservation row FOR UPDATE
        const rows = await tx.$queryRaw<Reservation[]>`
          SELECT * FROM "Reservation"
          WHERE "id" = ${reservationId}
          FOR UPDATE
        `;
        const locked = rows[0];
        if (!locked) {
          throw new ReservationNotFoundError(reservationId);
        }
        if (locked.status !== ReservationStatus.WAITING) {
          throw new ReservationNotWaitingError(reservationId, locked.status);
        }

        // 3. State machine assertion
        assertValidReservationTransition(
          locked.status as ReservationStatus,
          ReservationStatus.CANCELLED,
        );

        // 4. Update row
        const cancelledAt = this.clockService.now();
        const updated = await tx.reservation.update({
          where: { id: reservationId },
          data: {
            status: ReservationStatus.CANCELLED,
            cancelledAt,
            cancelReason: finalReason,
            cancelledById: actor.id,
          },
        });

        // 5. Emit domain event post-commit
        onCommit(() => {
          this.eventEmitter.emit(
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
        });

        return updated;
      }, INTERACTIVE_TX_OPTIONS);
    });
  }

  /**
   * Returns all reservations for a member ordered by createdAt DESC with their computed queue position.
   */
  async myReservations(
    userId: number,
  ): Promise<Array<Reservation & { position: number | null }>> {
    const rows = await this.prisma.$queryRaw<
      Array<Reservation & { position: number | null }>
    >`
      WITH ranked_waiting AS (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY "bookId" ORDER BY id ASC)::int as position
        FROM "Reservation"
        WHERE status = 'WAITING'
      )
      SELECT
        r.id,
        r."userId",
        r."bookId",
        r.status,
        r."createdAt",
        r."promotedAt",
        r."holdId",
        r."cancelledAt",
        r."cancelReason",
        r."cancelledById",
        w.position
      FROM "Reservation" r
      LEFT JOIN ranked_waiting w ON r.id = w.id
      WHERE r."userId" = ${userId}
      ORDER BY r."createdAt" DESC
    `;
    return rows;
  }

  /**
   * Staff-only query returning all WAITING reservations for a book in FIFO order with their positions.
   */
  async getQueueForBook(
    bookId: number,
  ): Promise<Array<Reservation & { position: number }>> {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        bookId,
        status: ReservationStatus.WAITING,
      },
      orderBy: { id: 'asc' },
    });

    return reservations.map((r, index) => ({
      ...r,
      position: index + 1,
    }));
  }

  /**
   * Computes 1-based queue position if WAITING, or null if promoted/cancelled.
   */
  async getQueuePosition(reservationId: number): Promise<number | null> {
    const res = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, bookId: true, status: true },
    });

    if (!res || res.status !== ReservationStatus.WAITING) {
      return null;
    }

    return await this.prisma.reservation.count({
      where: {
        bookId: res.bookId,
        status: ReservationStatus.WAITING,
        id: { lte: res.id },
      },
    });
  }

  /**
   * Returns the count of WAITING reservations for a book.
   */
  async countWaitingByBookId(bookId: number): Promise<number> {
    return await this.prisma.reservation.count({
      where: {
        bookId,
        status: ReservationStatus.WAITING,
      },
    });
  }

  /**
   * Helper called during hold creation or walk-in checkout to cancel any active WAITING reservation
   * for the patron on the same book with cancelReason = SUPERSEDED.
   */
  async cancelWaitingForUserAndBook(
    tx: Prisma.TransactionClient,
    userId: number,
    bookId: number,
    reason: ReservationCancelReason = ReservationCancelReason.SUPERSEDED,
    actorId?: number,
    onCommit?: (cb: () => void) => void,
  ): Promise<Reservation | null> {
    return cancelWaitingForUserAndBook(
      tx,
      userId,
      bookId,
      this.clockService,
      this.eventEmitter,
      reason,
      actorId,
      onCommit,
    );
  }
}
