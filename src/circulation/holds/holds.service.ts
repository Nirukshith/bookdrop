import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  FineReason,
  Hold,
  HoldSource,
  HoldStatus,
  Prisma,
  ReservationCancelReason,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { withTransactionRetry } from '../../common/database';
import { BooksService } from '../../books';
import { CopiesService } from '../copies/copies.service';
import { ClockService } from '../../common/clock';
import {
  computePickupDeadline,
  MEMBER_ADVISORY_NAMESPACE,
  MISSED_PICKUPS_BEFORE_FINE,
  MISSED_PICKUP_FINE_RS,
  MISSED_PICKUP_GRACE_MINUTES,
  rsToMinor,
  selectMissedPickupsToAssess,
  isExcusedAsSystemDelay,
} from '../../config/library-rules';
import { cancelWaitingForUserAndBook } from '../reservations/utils/supersede-reservation.helper';
import { MemberEligibilityPolicy } from './member-eligibility.policy';
import { HoldsPublicApi } from './holds-public-api.interface';
import {
  FINES_PUBLIC_API,
  FinesPublicApi,
} from '../fines/fines-public-api.interface';
import { PaginationArgs, StaffHoldFilter } from './dto/hold-query.dto';
import { CancelledBy } from '../../contracts/events';
import {
  HoldCreatedEvent,
  HoldCancelledEvent,
  HoldExpiredEvent,
  HoldFulfilledEvent,
  MissedPickupRecordedEvent,
  MissedPickupFineAssessedEvent,
} from './events';
import {
  HoldNotFoundError,
  NoCopiesAvailableError,
  BookNotFoundError,
  HoldNotActiveError,
} from './errors';

export const HOLD_ADVISORY_NAMESPACE = 4201;

const INTERACTIVE_TX_OPTIONS = {
  maxWait: 15000,
  timeout: 20000,
};

@Injectable()
export class HoldsService implements HoldsPublicApi {
  private readonly logger = new Logger(HoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly booksService: BooksService,
    @Inject(forwardRef(() => CopiesService))
    private readonly copiesService: CopiesService,
    private readonly clockService: ClockService,
    private readonly eligibilityPolicy: MemberEligibilityPolicy,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => FINES_PUBLIC_API))
    private readonly finesPublicApi: FinesPublicApi,
  ) {}

  /**
   * requestHold: Atomically places a hold on an available copy of the requested book.
   * Runs in a single transaction in exact order:
   * 1. Per-member advisory transaction lock (pg_advisory_xact_lock)
   * 2. Catalog book existence validation
   * 3. MemberEligibilityPolicy verification
   * 4. FOR UPDATE SKIP LOCKED copy selection
   * 5. Copy state transition AVAILABLE -> ON_HOLD
   * 6. Hold record insertion with calculated expiresAt
   * 7. Post-commit event emission (hold.created)
   */
  async requestHold(userId: number, bookId: number): Promise<Hold> {
    const { hold, now, expiresAt } = await withTransactionRetry(
      ({ onCommit }) =>
        this.prisma.$transaction(async (tx) => {
          // 1. Per-member advisory lock to serialize simultaneous requests by the same user
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_ADVISORY_NAMESPACE}::int, ${userId}::int)`;

          // 2. Verify book exists in the Catalog public interface
          const bookExists = await this.booksService.exists(bookId);
          if (!bookExists) {
            throw new BookNotFoundError(bookId);
          }

          // 3. Run eligibility policy inside the transaction
          await this.eligibilityPolicy.checkRequestEligibility(
            userId,
            bookId,
            tx,
          );

          // 4. Select one available copy using FOR UPDATE SKIP LOCKED
          const candidates = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM "Copy"
          WHERE "bookId" = ${bookId}
            AND status = 'AVAILABLE'
            AND "retiredAt" IS NULL
          ORDER BY id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;

          if (!candidates || candidates.length === 0) {
            throw new NoCopiesAvailableError(bookId);
          }

          const copyId = candidates[0].id;

          // 5. Move copy AVAILABLE -> ON_HOLD within this transaction
          await this.copiesService.transitionStatus(
            copyId,
            [CopyStatus.AVAILABLE],
            CopyStatus.ON_HOLD,
            {
              reason: `Hold requested by member #${userId}`,
              changedById: userId,
            },
            tx,
          );

          // 6. Create Hold record with calculated deadline
          const currentTime = this.clockService.now();
          const calculatedExpiresAt = computePickupDeadline(currentTime);

          const createdHold = await tx.hold.create({
            data: {
              userId,
              bookId,
              copyId,
              status: HoldStatus.ACTIVE,
              source: HoldSource.REQUEST,
              expiresAt: calculatedExpiresAt,
              createdAt: currentTime,
            },
            include: { copy: true },
          });

          // 7. Cancel any active WAITING reservation for this user and book (SUPERSEDED)
          await cancelWaitingForUserAndBook(
            tx,
            userId,
            bookId,
            this.clockService,
            this.eventEmitter,
            ReservationCancelReason.SUPERSEDED,
            userId,
            onCommit,
          );

          return {
            hold: createdHold,
            now: currentTime,
            expiresAt: calculatedExpiresAt,
          };
        }, INTERACTIVE_TX_OPTIONS),
    );

    // 7. Emit domain event strictly after transaction successfully commits
    this.eventEmitter.emit(
      HoldCreatedEvent.EVENT_NAME,
      new HoldCreatedEvent(
        hold.id,
        hold.userId,
        hold.bookId,
        hold.copyId,
        expiresAt,
        now,
      ),
    );

    return hold;
  }

  /**
   * cancelHold: Cancels an ACTIVE hold and releases its copy back to AVAILABLE.
   * Enforces role authorization and data consistency between Hold and Copy.
   */
  async cancelHold(
    holdId: number,
    actor: { id: number; role: string },
    reason?: string,
  ): Promise<Hold> {
    const existing = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: { copy: true },
    });

    if (!existing) {
      throw new HoldNotFoundError(holdId);
    }

    // Authorization: Members can only cancel their own holds; Staff can cancel any hold
    if (actor.role === 'MEMBER' && existing.userId !== actor.id) {
      throw new ForbiddenException('Members can only cancel their own holds.');
    }

    if (existing.status !== HoldStatus.ACTIVE) {
      throw new HoldNotActiveError(holdId, existing.status);
    }

    const cancellationNote =
      reason?.trim() || `Cancelled by ${actor.role} #${actor.id}`;
    const now = this.clockService.now();

    const cancelledHold = await withTransactionRetry(({ onCommit }) =>
      this.prisma.$transaction(async (tx) => {
        // Conditional update: only update if still ACTIVE
        const updateResult = await tx.hold.updateMany({
          where: {
            id: holdId,
            status: HoldStatus.ACTIVE,
          },
          data: {
            status: HoldStatus.CANCELLED,
            resolvedAt: now,
            resolvedNote: cancellationNote,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            `Cannot cancel hold #${holdId}: hold was already resolved concurrently.`,
          );
        }

        // Verify physical copy consistency
        const copy = await tx.copy.findUnique({
          where: { id: existing.copyId },
        });

        if (!copy || copy.status !== CopyStatus.ON_HOLD) {
          this.logger.error(
            `Data inconsistency: Copy #${existing.copyId} is in status '${copy?.status}' instead of 'ON_HOLD' while cancelling Hold #${holdId}`,
          );
          throw new ConflictException(
            `Cannot cancel hold #${holdId}: physical copy #${existing.copyId} is in inconsistent state '${copy?.status}'.`,
          );
        }

        // Return copy to AVAILABLE
        await this.copiesService.transitionStatus(
          existing.copyId,
          [CopyStatus.ON_HOLD],
          CopyStatus.AVAILABLE,
          {
            reason: `Hold #${holdId} cancelled: ${cancellationNote}`,
            changedById: actor.id,
            onCommit,
          },
          tx,
        );

        return tx.hold.findUniqueOrThrow({
          where: { id: holdId },
          include: { copy: true },
        });
      }, INTERACTIVE_TX_OPTIONS),
    );

    const cancelledBy: CancelledBy =
      actor.role === 'MEMBER' ? 'member' : 'staff';

    // Emit event post-commit
    this.eventEmitter.emit(
      HoldCancelledEvent.EVENT_NAME,
      new HoldCancelledEvent(
        cancelledHold.id,
        cancelledBy,
        cancellationNote,
        cancelledHold.userId,
        cancelledHold.bookId,
        cancelledHold.copyId,
        actor.id,
        now,
      ),
    );

    return cancelledHold;
  }

  /**
   * expireHold: Idempotently expires a single hold if its deadline has elapsed.
   * Lock order:
   * 1. Read hold snapshot without lock to identify member and verify eligibility
   * 2. Per-member advisory lock (pg_advisory_xact_lock)
   * 3. Hold row lock (FOR UPDATE)
   * 4. Updates hold to EXPIRED
   * 5. Inserts MissedPickup (marked excused if >60m system delay), assesses fine if threshold reached
   * 6. Releases copy to AVAILABLE (which offers copy to waiting reservation queue)
   * 7. Post-commit emits hold.expired, missed_pickup.recorded, missed_pickup.fine_assessed
   */
  async expireHold(holdId: number): Promise<Hold | null> {
    const now = this.clockService.now();

    // 1. Read hold without a lock to learn member and check initial eligibility
    const holdSnapshot = await this.prisma.hold.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        userId: true,
        bookId: true,
        copyId: true,
        status: true,
        expiresAt: true,
      },
    });

    if (
      !holdSnapshot ||
      holdSnapshot.status !== HoldStatus.ACTIVE ||
      holdSnapshot.expiresAt > now
    ) {
      return null;
    }

    const result = await withTransactionRetry(({ onCommit }) =>
      this.prisma.$transaction(async (tx) => {
        // 2. Take member advisory lock first
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_ADVISORY_NAMESPACE}, ${holdSnapshot.userId})`;

        // 3. Lock the hold row
        const lockedHolds = await tx.$queryRaw<
          {
            id: number;
            userId: number;
            bookId: number;
            copyId: number;
            status: HoldStatus;
            expiresAt: Date;
          }[]
        >`
          SELECT id, "userId", "bookId", "copyId", status, "expiresAt"
          FROM "Hold"
          WHERE id = ${holdId}
          FOR UPDATE
        `;

        if (!lockedHolds || lockedHolds.length === 0) {
          return null;
        }

        const hold = lockedHolds[0];
        if (hold.status !== HoldStatus.ACTIVE || hold.expiresAt > now) {
          return null;
        }

        // 4. Update hold to EXPIRED
        await tx.hold.update({
          where: { id: holdId },
          data: {
            status: HoldStatus.EXPIRED,
            resolvedAt: now,
            resolvedNote: 'Expired due to missed pickup deadline',
          },
        });

        // 5. BEFORE copy release: MissedPickup tracking & fines
        const excused = isExcusedAsSystemDelay(
          hold.expiresAt,
          now,
          MISSED_PICKUP_GRACE_MINUTES,
        );
        const excusedReason = excused ? 'SYSTEM_DELAY' : null;

        const insertedCount = await tx.$executeRaw`
          INSERT INTO "MissedPickup" ("userId", "holdId", "excused", "excusedReason", "createdAt")
          VALUES (${hold.userId}, ${hold.id}, ${excused}, ${excusedReason}, ${now})
          ON CONFLICT ("holdId") DO NOTHING
        `;

        if (insertedCount === 0) {
          // Already recorded, treat whole expiry as already processed
          return tx.hold.findUnique({
            where: { id: holdId },
            include: { copy: true },
          });
        }

        let unassessedCount = 0;
        const fineEventsToEmit: {
          fineId: number;
          holdIds: number[];
          amountMinor: number;
          missedPickupIds?: number[];
        }[] = [];

        if (!excused) {
          const unassessed = await tx.missedPickup.findMany({
            where: {
              userId: hold.userId,
              fineId: null,
              excused: false,
            },
            orderBy: { id: 'asc' }, // oldest first
          });

          const { groups, remainder } = selectMissedPickupsToAssess(
            unassessed,
            MISSED_PICKUPS_BEFORE_FINE,
          );

          unassessedCount = remainder.length;

          for (const group of groups) {
            const oldestPickup = group[0];
            const holdIds = group.map((p) => p.holdId);
            const note = `Missed pickups for holds: ${holdIds.map((hid) => '#' + hid).join(', ')}`;
            const dedupeKey = `missed-pickups:${hold.userId}:${oldestPickup.id}`;
            const amountMinor = rsToMinor(MISSED_PICKUP_FINE_RS);

            const fine = await this.finesPublicApi.createFine(
              {
                userId: hold.userId,
                reason: FineReason.MISSED_PICKUPS,
                amountMinor,
                note,
                dedupeKey,
                createdById: null,
              },
              tx,
            );

            await tx.missedPickup.updateMany({
              where: { id: { in: group.map((p) => p.id) } },
              data: { fineId: fine.id },
            });

            fineEventsToEmit.push({
              fineId: fine.id,
              holdIds,
              amountMinor,
              missedPickupIds: group.map((p) => p.id),
            });
          }
        } else {
          unassessedCount = await tx.missedPickup.count({
            where: {
              userId: hold.userId,
              fineId: null,
              excused: false,
            },
          });
        }

        // 6. Release copy to AVAILABLE (triggers queue promotion if reservation waiting)
        await this.copiesService.transitionStatus(
          hold.copyId,
          [CopyStatus.ON_HOLD],
          CopyStatus.AVAILABLE,
          {
            reason: `Hold #${holdId} expired at pickup deadline`,
            onCommit,
          },
          tx,
        );

        // 7. Post-commit event notifications
        onCommit(() => {
          this.eventEmitter.emit(
            HoldExpiredEvent.EVENT_NAME,
            new HoldExpiredEvent(
              hold.id,
              hold.userId,
              hold.bookId,
              hold.copyId,
              now,
            ),
          );

          this.eventEmitter.emit(
            MissedPickupRecordedEvent.EVENT_NAME,
            new MissedPickupRecordedEvent(
              hold.userId,
              hold.id,
              excused,
              unassessedCount,
              MISSED_PICKUPS_BEFORE_FINE,
              now,
              hold.bookId,
              now,
              excused ? 'SYSTEM_DELAY' : null,
            ),
          );

          for (const fe of fineEventsToEmit) {
            this.eventEmitter.emit(
              MissedPickupFineAssessedEvent.EVENT_NAME,
              new MissedPickupFineAssessedEvent(
                hold.userId,
                fe.fineId,
                fe.holdIds,
                fe.amountMinor,
                now,
                fe.missedPickupIds,
              ),
            );
          }
        });

        return tx.hold.findUniqueOrThrow({
          where: { id: holdId },
          include: { copy: true },
        });
      }, INTERACTIVE_TX_OPTIONS),
    );

    return result;
  }

  /**
   * expireDueHolds: Batch expires all ACTIVE holds with expiresAt <= now().
   * Processes each hold in its own separate transaction through expireHold.
   */
  async expireDueHolds(
    batchSize = 50,
  ): Promise<{ processed: number; errors: number; totalCandidates: number }> {
    const now = this.clockService.now();

    const candidates = await this.prisma.hold.findMany({
      where: {
        status: HoldStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
    });

    let processed = 0;
    let errors = 0;

    for (const candidate of candidates) {
      try {
        const expired = await this.expireHold(candidate.id);
        if (expired) {
          processed++;
        }
      } catch (err) {
        this.logger.error(
          `Failed to process due hold #${candidate.id} during batch expiration`,
          err,
        );
        errors++;
      }
    }

    return {
      processed,
      errors,
      totalCandidates: candidates.length,
    };
  }

  /**
   * fulfillHold: Used by Stage 6 Loans upon checkout.
   * Conditionally marks hold as FULFILLED if active and not expired.
   * Does NOT touch the physical copy (Loans handles moving it to BORROWED).
   */
  async fulfillHold(
    holdId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Hold> {
    const client = tx ?? this.prisma;
    const now = this.clockService.now();

    const existing = await client.hold.findUnique({
      where: { id: holdId },
    });

    if (!existing) {
      throw new HoldNotFoundError(holdId);
    }

    if (existing.status !== HoldStatus.ACTIVE) {
      throw new HoldNotActiveError(holdId, existing.status);
    }

    if (existing.expiresAt < now) {
      throw new ConflictException(
        `Cannot fulfill hold #${holdId}: hold expired at ${existing.expiresAt.toISOString()}.`,
      );
    }

    const updateResult = await client.hold.updateMany({
      where: {
        id: holdId,
        status: HoldStatus.ACTIVE,
        expiresAt: { gte: now },
      },
      data: {
        status: HoldStatus.FULFILLED,
        resolvedAt: now,
        resolvedNote: 'Fulfilled by checkout',
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        `Cannot fulfill hold #${holdId}: concurrent modification occurred.`,
      );
    }

    const fulfilledHold = await client.hold.findUniqueOrThrow({
      where: { id: holdId },
      include: { copy: true },
    });

    if (!tx) {
      this.eventEmitter.emit(
        HoldFulfilledEvent.EVENT_NAME,
        new HoldFulfilledEvent(
          fulfilledHold.id,
          fulfilledHold.userId,
          fulfilledHold.bookId,
          fulfilledHold.copyId,
          now,
        ),
      );
    }

    return fulfilledHold;
  }

  /**
   * getHold: Finds a single hold by ID. Throws HoldNotFoundError if missing.
   */
  async getHold(id: number): Promise<Hold> {
    const hold = await this.prisma.hold.findUnique({
      where: { id },
      include: { copy: true },
    });

    if (!hold) {
      throw new HoldNotFoundError(id);
    }

    return hold;
  }

  /**
   * listMemberHolds: Retrieves all holds for a member, optionally filtered by status.
   */
  async listMemberHolds(userId: number, status?: HoldStatus): Promise<Hold[]> {
    return this.prisma.hold.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: { copy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * listHolds: Staff query with flexible filters and pagination.
   */
  async listHolds(
    filter?: StaffHoldFilter,
    pagination?: PaginationArgs,
  ): Promise<{ items: Hold[]; total: number }> {
    const where: Prisma.HoldWhereInput = {};

    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.userId) {
      where.userId = filter.userId;
    }
    if (filter?.bookId) {
      where.bookId = filter.bookId;
    }
    if (filter?.expiringBefore) {
      where.expiresAt = { lte: filter.expiringBefore };
    }

    const [items, total] = await Promise.all([
      this.prisma.hold.findMany({
        where,
        skip: pagination?.skip ?? 0,
        take: pagination?.take ?? 20,
        include: { copy: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.hold.count({ where }),
    ]);

    return { items, total };
  }
}
