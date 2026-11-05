import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Copy,
  CopyStatus,
  FineReason,
  HoldStatus,
  Loan,
  LoanStatus,
  Prisma,
  ReturnCondition,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import {
  DEFAULT_LIBRARY_TIMEZONE,
  LOAN_DAYS,
  LATE_FEE_PER_DAY_RS,
  LATE_FEE_CAP_RS,
  assertValidAssessedFineRs,
  validateFineAmountMinor,
  calculateLateFee,
  computeDaysLate,
  computeDueDate,
  resolveLateFeeCapMinor,
  rsToMinor,
} from '../../config/library-rules';
import { CopiesService } from '../copies/copies.service';
import { FinesService } from '../fines/fines.service';
import {
  HOLDS_PUBLIC_API,
  HoldsPublicApi,
} from '../holds/holds-public-api.interface';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import { CATALOG_PUBLIC_API, CatalogPublicApi } from '../../books';
import { MemberEligibilityPolicy } from '../holds/member-eligibility.policy';
import {
  AmountRequiredError,
  ConditionNoteRequiredError,
  CopyMismatchError,
  CopyNotAvailableError,
  CopyNotFoundError,
  CopyOnHoldError,
  HoldExistsUsePickupError,
  HoldExpiredError,
  HoldNotActiveError,
  HoldNotFoundError,
  LoanNotActiveError,
  LoanNotFoundError,
  MemberNotFoundError,
  NoActiveLoanForCopyError,
} from './errors';
import { PaginationArgs, StaffLoanFilter } from './dto/loan-query.dto';
import { HoldFulfilledEvent } from '../holds/events/hold-fulfilled.event';
import { LoanStartedEvent, LoanReturnedEvent, LoanLostEvent } from './events';
import { FineCreatedEvent } from '../fines/events';
import { DOMAIN_EVENT_NAMES } from '../../contracts/events';
import {
  LoansPublicApi,
  MarkLoanLostInput,
  ReturnLoanInput,
} from './loans-public-api.interface';
import { COPY_RELEASE_PORT, CopyReleasePort } from './ports';

export const HOLD_ADVISORY_NAMESPACE = 4201;

const INTERACTIVE_TX_OPTIONS = {
  maxWait: 15000,
  timeout: 20000,
};

@Injectable()
export class LoansService implements LoansPublicApi {
  private readonly logger = new Logger(LoansService.name);
  private readonly libraryTimezone: string;
  private readonly globalLateFeeCapRs: number | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
    private readonly configService: ConfigService,
    private readonly copiesService: CopiesService,
    private readonly finesService: FinesService,
    @Inject(COPY_RELEASE_PORT)
    private readonly copyReleasePort: CopyReleasePort,
    @Inject(HOLDS_PUBLIC_API)
    private readonly holdsPublicApi: HoldsPublicApi,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
    @Inject(CATALOG_PUBLIC_API)
    private readonly catalogPublicApi: CatalogPublicApi,
    private readonly eligibilityPolicy: MemberEligibilityPolicy,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.libraryTimezone = this.configService.get<string>(
      'LIBRARY_TIMEZONE',
      DEFAULT_LIBRARY_TIMEZONE,
    );
    const configuredCap = this.configService.get<number | string | null>(
      'LATE_FEE_CAP_RS',
      null,
    );
    this.globalLateFeeCapRs =
      configuredCap !== null &&
      configuredCap !== undefined &&
      configuredCap !== ''
        ? Number(configuredCap)
        : LATE_FEE_CAP_RS;
  }

  public getLibraryTimezone(): string {
    return this.libraryTimezone;
  }

  public getGlobalLateFeeCapRs(): number | null {
    return this.globalLateFeeCapRs;
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

        // 8. Snapshot book replacement price via Catalog public API
        const bookPriceMap = await this.catalogPublicApi.getBookPricesMinor([
          lockedCopy.bookId,
        ]);
        const priceMinorAtBorrow = bookPriceMap.get(lockedCopy.bookId) ?? null;

        // Insert Loan record
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
            priceMinorAtBorrow,
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

      // 7. Snapshot book replacement price via Catalog public API
      const bookPriceMap = await this.catalogPublicApi.getBookPricesMinor([
        copy.bookId,
      ]);
      const priceMinorAtBorrow = bookPriceMap.get(copy.bookId) ?? null;

      // Insert Loan with holdId = null
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
          priceMinorAtBorrow,
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

  /**
   * returnLoan: Processes the physical return of a borrowed copy in ONE transaction.
   *
   * Locking order:
   * 1. Read copy by barcode (COPY_NOT_FOUND).
   * 2. Find ACTIVE loan for copy without locking (NO_ACTIVE_LOAN_FOR_COPY) to learn the member.
   * 3. Take member advisory lock (HOLD_ADVISORY_NAMESPACE, userId).
   * 4. Lock loan row FOR UPDATE (fails with LOAN_NOT_ACTIVE if status != ACTIVE).
   * 5. Lock copy row FOR UPDATE.
   * 6. returnedAt = clock.now(); compute daysLate in library timezone.
   * 7. Update loan ACTIVE -> RETURNED with returnCondition, conditionNote, returnedById.
   * 8. If daysLate > 0, createFine LATE_RETURN with dedupeKey 'late-return:<loanId>'.
   * 9. Condition:
   *    - GOOD: release copy via CopyReleasePort.
   *    - DAMAGED: requires note (CONDITION_NOTE_REQUIRED). Move copy BORROWED -> DAMAGED.
   *      If damageFeeRs > 0, validate and createFine DAMAGED_BOOK with key 'damaged:<loanId>'.
   */
  async returnLoan(input: ReturnLoanInput): Promise<Loan> {
    const copy = await this.prisma.copy.findUnique({
      where: { barcode: input.copyBarcode.trim() },
    });

    if (!copy) {
      throw new CopyNotFoundError(input.copyBarcode.trim());
    }

    const activeLoan = await this.prisma.loan.findFirst({
      where: {
        copyId: copy.id,
        status: LoanStatus.ACTIVE,
      },
    });

    if (!activeLoan) {
      throw new NoActiveLoanForCopyError(input.copyBarcode.trim());
    }

    const memberId = activeLoan.userId;

    let damageFeeMinor: number | undefined = input.damageFeeMinor;
    if (input.condition === ReturnCondition.DAMAGED) {
      if (!input.conditionNote || !input.conditionNote.trim()) {
        throw new ConditionNoteRequiredError();
      }
      if (
        damageFeeMinor === undefined &&
        input.damageFeeRs !== undefined &&
        input.damageFeeRs > 0
      ) {
        if (Number.isInteger(input.damageFeeRs)) {
          assertValidAssessedFineRs(input.damageFeeRs);
          damageFeeMinor = rsToMinor(input.damageFeeRs);
        } else {
          damageFeeMinor = Math.round(input.damageFeeRs * 100);
        }
      }
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      // Step 1: Member advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_ADVISORY_NAMESPACE}::int, ${memberId}::int)`;

      // Step 2: Lock loan row FOR UPDATE
      const lockedLoans = await tx.$queryRaw<Loan[]>`
          SELECT * FROM "Loan" WHERE id = ${activeLoan.id} FOR UPDATE
        `;
      const loan = lockedLoans[0];

      if (!loan || loan.status !== LoanStatus.ACTIVE) {
        throw new LoanNotActiveError(activeLoan.id, loan?.status);
      }

      // Step 3: Lock copy row FOR UPDATE
      const lockedCopies = await tx.$queryRaw<Copy[]>`
          SELECT * FROM "Copy" WHERE id = ${copy.id} FOR UPDATE
        `;
      const lockedCopy = lockedCopies[0];

      if (!lockedCopy) {
        throw new CopyNotFoundError(input.copyBarcode.trim());
      }

      const returnedAt = this.clockService.now();
      const daysLate = computeDaysLate(
        loan.dueAt,
        returnedAt,
        this.libraryTimezone,
      );

      // Step 4: Update loan record
      const updatedLoan = await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: LoanStatus.RETURNED,
          returnedAt,
          returnCondition: input.condition,
          conditionNote: input.conditionNote?.trim() || null,
          returnedById: input.staffId,
        },
      });

      // Step 5: If overdue, assess late fee fine
      let lateFine: any = null;
      if (daysLate > 0) {
        let bookCurrentPriceMinor: number | null = null;
        if (
          loan.priceMinorAtBorrow === null ||
          loan.priceMinorAtBorrow === undefined
        ) {
          const bookPrices = await this.catalogPublicApi.getBookPricesMinor([
            loan.bookId,
          ]);
          bookCurrentPriceMinor = bookPrices.get(loan.bookId) ?? null;
        }

        const capMinor = resolveLateFeeCapMinor({
          loanSnapshotMinor: loan.priceMinorAtBorrow,
          bookCurrentPriceMinor,
          globalCapRs: this.globalLateFeeCapRs,
        });

        const calculation = calculateLateFee({
          daysLate,
          ratePerDayRs: LATE_FEE_PER_DAY_RS,
          capMinor,
        });

        if (calculation.amountMinor > 0) {
          lateFine = await this.finesService.createFine(
            {
              userId: loan.userId,
              reason: FineReason.LATE_RETURN,
              amountMinor: calculation.amountMinor,
              uncappedAmountMinor: calculation.uncappedAmountMinor,
              capMinor: calculation.capMinor,
              loanId: loan.id,
              daysLate,
              dedupeKey: FinesService.buildLateReturnDedupeKey(loan.id),
              createdById: input.staffId,
            },
            tx,
          );
        }
      }

      // Step 6: Condition handling
      let damagedFine: any = null;
      if (input.condition === ReturnCondition.GOOD) {
        await this.copyReleasePort.release(lockedCopy.id, tx);
      } else if (input.condition === ReturnCondition.DAMAGED) {
        const note = input.conditionNote!.trim();
        await this.copiesService.transitionStatus(
          lockedCopy.id,
          [CopyStatus.BORROWED],
          CopyStatus.DAMAGED,
          {
            reason: note,
            changedById: input.staffId,
          },
          tx,
        );

        if (damageFeeMinor !== undefined && damageFeeMinor > 0) {
          damagedFine = await this.finesService.createFine(
            {
              userId: loan.userId,
              reason: FineReason.DAMAGED_BOOK,
              amountMinor: damageFeeMinor,
              loanId: loan.id,
              note,
              dedupeKey: FinesService.buildDamagedDedupeKey(loan.id),
              createdById: input.staffId,
            },
            tx,
          );
        }
      }

      return {
        updatedLoan,
        loan,
        returnedAt,
        daysLate,
        lateFine,
        damagedFine,
      };
    }, INTERACTIVE_TX_OPTIONS);

    // Step 7: Emit domain events post-commit
    this.eventEmitter.emit(
      DOMAIN_EVENT_NAMES.LOAN_RETURNED,
      new LoanReturnedEvent(
        txResult.updatedLoan.id,
        txResult.loan.userId,
        txResult.loan.bookId,
        txResult.loan.copyId,
        txResult.returnedAt,
        txResult.daysLate,
        input.condition,
        txResult.returnedAt,
      ),
    );

    if (txResult.lateFine && (txResult.lateFine as any).isNew) {
      this.eventEmitter.emit(
        DOMAIN_EVENT_NAMES.FINE_CREATED,
        new FineCreatedEvent(
          txResult.lateFine.id,
          txResult.lateFine.userId,
          txResult.lateFine.reason,
          txResult.lateFine.amountMinor,
          txResult.lateFine.loanId,
          txResult.returnedAt,
        ),
      );
    }

    if (txResult.damagedFine && (txResult.damagedFine as any).isNew) {
      this.eventEmitter.emit(
        DOMAIN_EVENT_NAMES.FINE_CREATED,
        new FineCreatedEvent(
          txResult.damagedFine.id,
          txResult.damagedFine.userId,
          txResult.damagedFine.reason,
          txResult.damagedFine.amountMinor,
          txResult.damagedFine.loanId,
          txResult.returnedAt,
        ),
      );
    }

    return Object.assign(txResult.updatedLoan, {
      daysLate: txResult.daysLate,
    });
  }

  /**
   * markLoanLost: Marks an active loan as lost in ONE transaction.
   *
   * Same locking order:
   * 1. Read loan without locking to find member (LOAN_NOT_FOUND).
   * 2. Take member advisory lock, lock loan FOR UPDATE (LOAN_NOT_ACTIVE), lock copy FOR UPDATE.
   * 3. Fee is required and must be positive; note is required.
   * 4. Loan ACTIVE -> LOST with lostAt = now.
   * 5. Copy BORROWED -> LOST with transitionStatus (history row with note).
   * 6. createFine LOST_BOOK with key 'lost:<loanId>', and no late fee.
   */
  async markLoanLost(input: MarkLoanLostInput): Promise<Loan> {
    if (!input.note || !input.note.trim()) {
      throw new BadRequestException(
        'A note is required when declaring a loan lost',
      );
    }

    if (input.assessedFeeRs !== undefined && input.assessedFeeRs !== null) {
      assertValidAssessedFineRs(input.assessedFeeRs);
    }
    if (
      input.assessedFeeMinor !== undefined &&
      input.assessedFeeMinor !== null
    ) {
      validateFineAmountMinor(input.assessedFeeMinor);
    }

    const loan = await this.prisma.loan.findUnique({
      where: { id: input.loanId },
    });

    if (!loan) {
      throw new LoanNotFoundError(input.loanId);
    }

    let assessedMinor: number;
    if (
      input.assessedFeeMinor !== undefined &&
      input.assessedFeeMinor !== null
    ) {
      assessedMinor = input.assessedFeeMinor;
    } else if (
      input.assessedFeeRs !== undefined &&
      input.assessedFeeRs !== null
    ) {
      assessedMinor = rsToMinor(input.assessedFeeRs);
    } else {
      // Default to the book's price snapshot (or current price if no snapshot)
      let resolvedPriceMinor: number | null = loan.priceMinorAtBorrow ?? null;
      if (resolvedPriceMinor === null) {
        const bookPrices = await this.catalogPublicApi.getBookPricesMinor([
          loan.bookId,
        ]);
        resolvedPriceMinor = bookPrices.get(loan.bookId) ?? null;
      }

      if (resolvedPriceMinor === null) {
        throw new AmountRequiredError();
      }
      assessedMinor = resolvedPriceMinor;
    }

    const memberId = loan.userId;

    const txResult = await this.prisma.$transaction(async (tx) => {
      // Step 1: Member advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_ADVISORY_NAMESPACE}::int, ${memberId}::int)`;

      // Step 2: Lock loan row FOR UPDATE
      const lockedLoans = await tx.$queryRaw<Loan[]>`
          SELECT * FROM "Loan" WHERE id = ${loan.id} FOR UPDATE
        `;
      const currentLoan = lockedLoans[0];

      if (!currentLoan || currentLoan.status !== LoanStatus.ACTIVE) {
        throw new LoanNotActiveError(loan.id, currentLoan?.status);
      }

      // Step 3: Lock copy row FOR UPDATE
      const lockedCopies = await tx.$queryRaw<Copy[]>`
          SELECT * FROM "Copy" WHERE id = ${currentLoan.copyId} FOR UPDATE
        `;
      const lockedCopy = lockedCopies[0];

      if (!lockedCopy) {
        throw new NotFoundException(`Copy #${currentLoan.copyId} not found`);
      }

      const now = this.clockService.now();
      const note = input.note.trim();

      // Step 4: Update loan to LOST
      const updatedLoan = await tx.loan.update({
        where: { id: currentLoan.id },
        data: {
          status: LoanStatus.LOST,
          lostAt: now,
        },
      });

      // Step 5: Transition copy BORROWED -> LOST
      await this.copiesService.transitionStatus(
        lockedCopy.id,
        [CopyStatus.BORROWED],
        CopyStatus.LOST,
        {
          reason: note,
          changedById: input.staffId,
        },
        tx,
      );

      // Step 6: Create LOST_BOOK fine (no late fee is charged!)
      const lostFine = await this.finesService.createFine(
        {
          userId: currentLoan.userId,
          reason: FineReason.LOST_BOOK,
          amountMinor: assessedMinor,
          loanId: currentLoan.id,
          note,
          dedupeKey: FinesService.buildLostDedupeKey(currentLoan.id),
          createdById: input.staffId,
        },
        tx,
      );

      return { updatedLoan, currentLoan, lostFine, now };
    }, INTERACTIVE_TX_OPTIONS);

    // Step 7: Emit domain events post-commit
    this.eventEmitter.emit(
      DOMAIN_EVENT_NAMES.LOAN_LOST,
      new LoanLostEvent(
        txResult.updatedLoan.id,
        txResult.currentLoan.userId,
        txResult.currentLoan.bookId,
        txResult.currentLoan.copyId,
        txResult.now,
      ),
    );

    if (txResult.lostFine && (txResult.lostFine as any).isNew) {
      this.eventEmitter.emit(
        DOMAIN_EVENT_NAMES.FINE_CREATED,
        new FineCreatedEvent(
          txResult.lostFine.id,
          txResult.lostFine.userId,
          txResult.lostFine.reason,
          txResult.lostFine.amountMinor,
          txResult.lostFine.loanId,
          txResult.now,
        ),
      );
    }

    return txResult.updatedLoan;
  }
}
