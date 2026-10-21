import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  Hold,
  HoldSource,
  HoldStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BooksService } from '../../books';
import { CopiesService } from '../copies/copies.service';
import { ClockService } from '../../common/clock';
import { computePickupDeadline } from '../../config/library-rules';
import { MemberEligibilityPolicy } from './member-eligibility.policy';
import { HoldsPublicApi } from './holds-public-api.interface';
import { PaginationArgs, StaffHoldFilter } from './dto/hold-query.dto';
import {
  HoldCreatedEvent,
  HoldCancelledEvent,
  HoldExpiredEvent,
  HoldFulfilledEvent,
} from './events';
import { HoldNotFoundError, NoCopiesAvailableError } from './errors';

export const HOLD_ADVISORY_NAMESPACE = 4201;

@Injectable()
export class HoldsService implements HoldsPublicApi {
  private readonly logger = new Logger(HoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly booksService: BooksService,
    private readonly copiesService: CopiesService,
    private readonly clockService: ClockService,
    private readonly eligibilityPolicy: MemberEligibilityPolicy,
    private readonly eventEmitter: EventEmitter2,
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
    const { hold, now, expiresAt } = await this.prisma.$transaction(
      async (tx) => {
        // 1. Per-member advisory lock to serialize simultaneous requests by the same user
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_ADVISORY_NAMESPACE}, ${userId})`;

        // 2. Verify book exists in the Catalog public interface
        const bookExists = await this.booksService.exists(bookId);
        if (!bookExists) {
          throw new NotFoundException(`Book #${bookId} not found in catalog.`);
        }

        // 3. Run eligibility policy inside the transaction
        await this.eligibilityPolicy.assertEligible(userId, bookId, tx);

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

        return {
          hold: createdHold,
          now: currentTime,
          expiresAt: calculatedExpiresAt,
        };
      },
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
      throw new ConflictException(
        `Cannot cancel hold #${holdId}: current status is '${existing.status}', expected 'ACTIVE'.`,
      );
    }

    const cancellationNote =
      reason?.trim() || `Cancelled by ${actor.role} #${actor.id}`;
    const now = this.clockService.now();

    const cancelledHold = await this.prisma.$transaction(async (tx) => {
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
        },
        tx,
      );

      return tx.hold.findUniqueOrThrow({
        where: { id: holdId },
        include: { copy: true },
      });
    });

    // Emit event post-commit
    this.eventEmitter.emit(
      HoldCancelledEvent.EVENT_NAME,
      new HoldCancelledEvent(
        cancelledHold.id,
        cancelledHold.userId,
        cancelledHold.bookId,
        cancelledHold.copyId,
        actor.id,
        cancellationNote,
        now,
      ),
    );

    return cancelledHold;
  }

  /**
   * expireHold: Idempotently expires a single hold if its deadline has elapsed.
   * Releases copy to AVAILABLE and emits hold.expired.
   */
  async expireHold(holdId: number): Promise<Hold | null> {
    const now = this.clockService.now();

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.hold.findUnique({
        where: { id: holdId },
      });

      if (!existing) {
        return null;
      }

      if (existing.status !== HoldStatus.ACTIVE || existing.expiresAt > now) {
        return null;
      }

      const updateResult = await tx.hold.updateMany({
        where: {
          id: holdId,
          status: HoldStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        data: {
          status: HoldStatus.EXPIRED,
          resolvedAt: now,
          resolvedNote: 'Expired due to missed pickup deadline',
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      await this.copiesService.transitionStatus(
        existing.copyId,
        [CopyStatus.ON_HOLD],
        CopyStatus.AVAILABLE,
        {
          reason: `Hold #${holdId} expired at pickup deadline`,
        },
        tx,
      );

      return tx.hold.findUniqueOrThrow({
        where: { id: holdId },
        include: { copy: true },
      });
    });

    if (result) {
      this.eventEmitter.emit(
        HoldExpiredEvent.EVENT_NAME,
        new HoldExpiredEvent(
          result.id,
          result.userId,
          result.bookId,
          result.copyId,
          now,
        ),
      );
    }

    return result;
  }

  /**
   * expireDueHolds: Batch expires all ACTIVE holds with expiresAt <= now().
   * Processes each hold in its own separate transaction using FOR UPDATE SKIP LOCKED
   * to guarantee concurrent safety without blocking or duplicate processing.
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
        const expired = await this.expireSingleHoldWithLock(candidate.id, now);
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
   * Helper: Expire a single candidate hold within its own isolated transaction with skip lock.
   */
  private async expireSingleHoldWithLock(
    holdId: number,
    now: Date,
  ): Promise<Hold | null> {
    const expired = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number; copyId: number }[]>`
        SELECT id, "copyId" FROM "Hold"
        WHERE id = ${holdId}
          AND status = 'ACTIVE'
          AND "expiresAt" <= ${now}
        FOR UPDATE SKIP LOCKED
      `;

      if (!locked || locked.length === 0) {
        return null;
      }

      await tx.hold.update({
        where: { id: holdId },
        data: {
          status: HoldStatus.EXPIRED,
          resolvedAt: now,
          resolvedNote: 'Expired due to missed pickup deadline',
        },
      });

      await this.copiesService.transitionStatus(
        locked[0].copyId,
        [CopyStatus.ON_HOLD],
        CopyStatus.AVAILABLE,
        {
          reason: `Hold #${holdId} expired at pickup deadline`,
        },
        tx,
      );

      return tx.hold.findUniqueOrThrow({
        where: { id: holdId },
        include: { copy: true },
      });
    });

    if (expired) {
      this.eventEmitter.emit(
        HoldExpiredEvent.EVENT_NAME,
        new HoldExpiredEvent(
          expired.id,
          expired.userId,
          expired.bookId,
          expired.copyId,
          now,
        ),
      );
    }

    return expired;
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
      throw new ConflictException(
        `Cannot fulfill hold #${holdId}: current status is '${existing.status}', expected 'ACTIVE'.`,
      );
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
