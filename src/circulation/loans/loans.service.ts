import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  HoldStatus,
  Loan,
  LoanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import {
  DEFAULT_LIBRARY_TIMEZONE,
  LOAN_DAYS,
  computeDueDate,
} from '../../config/library-rules';
import { CopiesService } from '../copies/copies.service';
import {
  HOLDS_PUBLIC_API,
  HoldsPublicApi,
} from '../holds/holds-public-api.interface';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import { MemberEligibilityPolicy } from '../holds/member-eligibility.policy';
import {
  CopyMismatchError,
  CopyNotAvailableError,
  CopyNotFoundError,
  CopyOnHoldError,
  HoldExistsUsePickupError,
  HoldExpiredError,
  HoldNotActiveError,
  HoldNotFoundError,
  LoanNotFoundError,
  MemberNotFoundError,
} from './errors';
import { PaginationArgs, StaffLoanFilter } from './dto/loan-query.dto';
import { HoldFulfilledEvent } from '../holds/events/hold-fulfilled.event';
import { LoanStartedEvent } from './events/loan-started.event';
import { LoansPublicApi } from './loans-public-api.interface';

export const HOLD_ADVISORY_NAMESPACE = 4201;

const INTERACTIVE_TX_OPTIONS = {
  maxWait: 15000,
  timeout: 20000,
};

@Injectable()
export class LoansService implements LoansPublicApi {
  private readonly logger = new Logger(LoansService.name);
  private readonly libraryTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
    private readonly configService: ConfigService,
    private readonly copiesService: CopiesService,
    @Inject(HOLDS_PUBLIC_API)
    private readonly holdsPublicApi: HoldsPublicApi,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
    private readonly eligibilityPolicy: MemberEligibilityPolicy,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.libraryTimezone = this.configService.get<string>(
      'LIBRARY_TIMEZONE',
      DEFAULT_LIBRARY_TIMEZONE,
    );
  }

  /**
   * confirmPickup: Fulfills a member's active hold into an active loan.
   * Runs in ONE transaction in strict lock order:
   * 1. Read hold without locking to learn userId, then take per-member advisory lock.
   * 2. Re-read hold with FOR UPDATE (fails with HOLD_NOT_FOUND or HOLD_NOT_ACTIVE).
   * 3. If expiresAt <= now: fail with HOLD_EXPIRED. Post-rollback, call expireHold in a separate tx.
   * 4. Verify scanned barcode belongs to the hold's copy (else COPY_MISMATCH).
   * 5. Run checkCheckoutEligibility.
   * 6. HoldsPublicApi.fulfillHold inside the transaction.
   * 7. transitionStatus for copy ON_HOLD -> BORROWED inside transaction.
   * 8. Insert Loan record.
   * 9. Emit domain events post-commit.
   */
  async confirmPickup(
    holdId: number,
    copyBarcode: string,
    staffId: number,
  ): Promise<Loan> {
    let result: {
      loan: Loan;
      userId: number;
      copyId: number;
      bookId: number;
      borrowedAt: Date;
      dueAt: Date;
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        // 1. Read hold without locking to discover userId
        const preliminary = await tx.hold.findUnique({
          where: { id: holdId },
          select: { userId: true },
        });

        if (!preliminary) {
          throw new HoldNotFoundError(holdId);
        }

        // Take per-member advisory lock first
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_ADVISORY_NAMESPACE}::int, ${preliminary.userId}::int)`;

        // 2. Re-read hold with FOR UPDATE
        const lockedHolds = await tx.$queryRaw<
          Array<{
            id: number;
            userId: number;
            bookId: number;
            copyId: number;
            status: HoldStatus;
            expiresAt: Date;
          }>
        >`
          SELECT id, "userId", "bookId", "copyId", status, "expiresAt"
          FROM "Hold"
          WHERE id = ${holdId}
          FOR UPDATE
        `;

        if (!lockedHolds || lockedHolds.length === 0) {
          throw new HoldNotFoundError(holdId);
        }

        const lockedHold = lockedHolds[0];

        if (lockedHold.status !== HoldStatus.ACTIVE) {
          throw new HoldNotActiveError(holdId, lockedHold.status);
        }

        // 3. Expiry check using ClockService
        const now = this.clockService.now();
        if (lockedHold.expiresAt <= now) {
          throw new HoldExpiredError(holdId, lockedHold.expiresAt);
        }

        // 4. Lock copy row FOR UPDATE by held copyId and verify scanned barcode
        const lockedCopies = await tx.$queryRaw<
          Array<{
            id: number;
            bookId: number;
            barcode: string;
            status: CopyStatus;
            retiredAt: Date | null;
          }>
        >`
          SELECT id, "bookId", barcode, status, "retiredAt"
          FROM "Copy"
          WHERE id = ${lockedHold.copyId}
          FOR UPDATE
        `;

        if (!lockedCopies || lockedCopies.length === 0) {
          throw new CopyNotFoundError(lockedHold.copyId);
        }

        const lockedCopy = lockedCopies[0];

        if (lockedCopy.barcode !== copyBarcode.trim()) {
          throw new CopyMismatchError(copyBarcode.trim(), lockedCopy.barcode);
        }

        // 5. Run checkCheckoutEligibility
        await this.eligibilityPolicy.checkCheckoutEligibility(
          lockedHold.userId,
          tx,
        );

        // 6. Call HoldsPublicApi.fulfillHold inside the transaction
        await this.holdsPublicApi.fulfillHold(holdId, tx);

        // 7. Call transitionStatus for the copy ON_HOLD -> BORROWED
        await this.copiesService.transitionStatus(
          lockedCopy.id,
          [CopyStatus.ON_HOLD],
          CopyStatus.BORROWED,
          {
            reason: `Hold #${holdId} picked up by member #${lockedHold.userId}`,
            changedById: staffId,
          },
          tx,
        );

        // 8. Insert Loan record
        const dueAt = computeDueDate(now, this.libraryTimezone, LOAN_DAYS);
        const createdLoan = await tx.loan.create({
          data: {
            userId: lockedHold.userId,
            copyId: lockedCopy.id,
            bookId: lockedCopy.bookId,
            holdId,
            status: LoanStatus.ACTIVE,
            borrowedAt: now,
            dueAt,
            checkedOutById: staffId,
          },
          include: { copy: true },
        });

        return {
          loan: createdLoan,
          userId: lockedHold.userId,
          copyId: lockedCopy.id,
          bookId: lockedCopy.bookId,
          borrowedAt: now,
          dueAt,
        };
      }, INTERACTIVE_TX_OPTIONS);
    } catch (error) {
      if (error instanceof HoldExpiredError) {
        // Self-healing: execute expireHold in a separate transaction post-rollback
        try {
          await this.holdsPublicApi.expireHold(holdId);
        } catch (expireError) {
          this.logger.warn(
            `Autonomous expireHold failed for expired hold #${holdId}: ${expireError}`,
          );
        }
      }
      throw error;
    }

    // 9. Emit domain events post-commit
    this.eventEmitter.emit(
      HoldFulfilledEvent.EVENT_NAME,
      new HoldFulfilledEvent(holdId, result.loan.id),
    );

    this.eventEmitter.emit(
      LoanStartedEvent.EVENT_NAME,
      new LoanStartedEvent(
        result.loan.id,
        result.userId,
        result.bookId,
        result.copyId,
        result.borrowedAt,
        result.dueAt,
        'PICKUP',
      ),
    );

    return result.loan;
  }

  /**
   * checkoutCopy: Lends an available copy directly to a walk-in member.
   * Runs in ONE transaction in strict lock order:
   * 1. Take member advisory lock; look up member via IdentityPublicApi.
   * 2. Lock copy row FOR UPDATE by barcode (fails with COPY_NOT_FOUND or retired).
   * 3. Copy must be AVAILABLE (fails with COPY_ON_HOLD or COPY_NOT_AVAILABLE).
   * 4. Member must NOT have an ACTIVE hold on the same book (fails with HOLD_EXISTS_USE_PICKUP).
   * 5. Run checkCheckoutEligibility.
   * 6. transitionStatus AVAILABLE -> BORROWED, insert Loan with holdId = null.
   * 7. Emit domain events post-commit.
   */
  async checkoutCopy(
    memberId: number,
    copyBarcode: string,
    staffId: number,
  ): Promise<Loan> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Take member lock first
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_ADVISORY_NAMESPACE}::int, ${memberId}::int)`;

      // Look up member via IdentityPublicApi
      const members = await this.identityPublicApi.getMembersByIds([memberId]);
      if (!members || members.length === 0) {
        throw new MemberNotFoundError(memberId);
      }

      // 2. Lock copy row FOR UPDATE by barcode
      const normalizedBarcode = copyBarcode.trim();
      const lockedCopies = await tx.$queryRaw<
        Array<{
          id: number;
          bookId: number;
          barcode: string;
          status: CopyStatus;
          retiredAt: Date | null;
        }>
      >`
        SELECT id, "bookId", barcode, status, "retiredAt"
        FROM "Copy"
        WHERE barcode = ${normalizedBarcode}
        FOR UPDATE
      `;

      if (!lockedCopies || lockedCopies.length === 0) {
        throw new CopyNotFoundError(normalizedBarcode);
      }

      const copy = lockedCopies[0];

      if (copy.retiredAt !== null) {
        throw new CopyNotAvailableError(
          `Copy with barcode '${normalizedBarcode}' is retired.`,
        );
      }

      // 3. Verify copy is AVAILABLE
      if (copy.status === CopyStatus.ON_HOLD) {
        throw new CopyOnHoldError(normalizedBarcode);
      }

      if (copy.status !== CopyStatus.AVAILABLE) {
        throw new CopyNotAvailableError(
          `Copy with barcode '${normalizedBarcode}' is not available (status: ${copy.status}).`,
        );
      }

      // 4. Verify member does not already have an ACTIVE hold on the same book
      const existingHold = await tx.hold.findFirst({
        where: {
          userId: memberId,
          bookId: copy.bookId,
          status: HoldStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (existingHold) {
        throw new HoldExistsUsePickupError(
          memberId,
          copy.bookId,
          existingHold.id,
        );
      }

      // 5. Run checkCheckoutEligibility
      await this.eligibilityPolicy.checkCheckoutEligibility(memberId, tx);

      // 6. transitionStatus AVAILABLE -> BORROWED
      await this.copiesService.transitionStatus(
        copy.id,
        [CopyStatus.AVAILABLE],
        CopyStatus.BORROWED,
        {
          reason: `Walk-in checkout to member #${memberId}`,
          changedById: staffId,
        },
        tx,
      );

      // 7. Insert Loan with holdId = null
      const now = this.clockService.now();
      const dueAt = computeDueDate(now, this.libraryTimezone, LOAN_DAYS);

      const createdLoan = await tx.loan.create({
        data: {
          userId: memberId,
          copyId: copy.id,
          bookId: copy.bookId,
          holdId: null,
          status: LoanStatus.ACTIVE,
          borrowedAt: now,
          dueAt,
          checkedOutById: staffId,
        },
        include: { copy: true },
      });

      return {
        loan: createdLoan,
        userId: memberId,
        copyId: copy.id,
        bookId: copy.bookId,
        borrowedAt: now,
        dueAt,
      };
    }, INTERACTIVE_TX_OPTIONS);

    // Emit domain event post-commit
    this.eventEmitter.emit(
      LoanStartedEvent.EVENT_NAME,
      new LoanStartedEvent(
        result.loan.id,
        result.userId,
        result.bookId,
        result.copyId,
        result.borrowedAt,
        result.dueAt,
        'WALK_IN',
      ),
    );

    return result.loan;
  }

  // --- Read Methods ---

  /**
   * listMemberLoans: Retrieves all loans for a given member, optionally filtered by status.
   */
  async listMemberLoans(userId: number, status?: LoanStatus): Promise<Loan[]> {
    return this.prisma.loan.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: { copy: true },
      orderBy: { borrowedAt: 'desc' },
    });
  }

  /**
   * listStaffLoans: Retrieves paginated loans with staff filters.
   * "overdue" is computed dynamically against now: (status === ACTIVE && dueAt < now).
   */
  async listStaffLoans(
    filter?: StaffLoanFilter,
    pagination?: PaginationArgs,
  ): Promise<{ items: Loan[]; total: number }> {
    const where: Prisma.LoanWhereInput = {};
    const now = this.clockService.now();

    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.userId) {
      where.userId = filter.userId;
    }
    if (filter?.bookId) {
      where.bookId = filter.bookId;
    }
    if (filter?.dueBefore) {
      where.dueAt = { lte: filter.dueBefore };
    }
    if (filter?.overdue === true) {
      where.status = LoanStatus.ACTIVE;
      where.dueAt = { lt: now };
    } else if (filter?.overdue === false) {
      where.OR = [
        { status: { not: LoanStatus.ACTIVE } },
        { dueAt: { gte: now } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.loan.findMany({
        where,
        skip: pagination?.skip ?? 0,
        take: pagination?.take ?? 20,
        include: { copy: true },
        orderBy: { borrowedAt: 'desc' },
      }),
      this.prisma.loan.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * getLoan: Retrieves a single loan by primary key ID.
   */
  async getLoan(id: number): Promise<Loan> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { copy: true },
    });

    if (!loan) {
      throw new LoanNotFoundError(id);
    }

    return loan;
  }

  /**
   * getActiveLoanByCopyBarcode: Finds the current active loan for a given copy barcode.
   */
  async getActiveLoanByCopyBarcode(barcode: string): Promise<Loan | null> {
    const copy = await this.prisma.copy.findUnique({
      where: { barcode: barcode.trim() },
    });

    if (!copy) {
      throw new CopyNotFoundError(barcode.trim());
    }

    return this.prisma.loan.findFirst({
      where: {
        copyId: copy.id,
        status: LoanStatus.ACTIVE,
      },
      include: { copy: true },
    });
  }

  /**
   * getActiveLoanByCopyId: Minimal public interface method for Stage 7.
   */
  async getActiveLoanByCopyId(copyId: number): Promise<Loan | null> {
    return this.prisma.loan.findFirst({
      where: {
        copyId,
        status: LoanStatus.ACTIVE,
      },
      include: { copy: true },
    });
  }

  /**
   * isOverdue: Pure calculation utility. Never stored as a database flag.
   */
  isOverdue(loan: { status: LoanStatus; dueAt: Date }): boolean {
    return (
      loan.status === LoanStatus.ACTIVE && this.clockService.now() > loan.dueAt
    );
  }
}
