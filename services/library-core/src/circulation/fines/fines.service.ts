import { Injectable, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Fine,
  FinePayment,
  FineReason,
  FineStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { DOMAIN_EVENT_NAMES } from '../../contracts/events';
import { validateFineAmountMinor } from '../../config/library-rules';
import { CreateFineInput, FinesPublicApi } from './fines-public-api.interface';
import {
  FineNotFoundError,
  FineNotPayableError,
  FineOverpaymentError,
} from './errors';
import {
  FineCreatedEvent,
  FinePaymentRecordedEvent,
  FineSettledEvent,
} from './events';

export const MEMBER_ADVISORY_NAMESPACE = 4201;

export interface ListFinesFilter {
  userId?: number;
  status?: FineStatus;
  reason?: FineReason;
}

export interface PaginationOptions {
  skip?: number;
  take?: number;
}

export interface MemberFinesResult {
  fines: Array<Fine & { outstandingMinor: number }>;
  totalOutstandingMinor: number;
}

export interface PaginatedFinesResult {
  items: Fine[];
  total: number;
}

@Injectable()
export class FinesService implements FinesPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly clockService: ClockService,
  ) {}

  /**
   * Helper to format standard deduplication keys.
   */
  static buildLateReturnDedupeKey(loanId: number): string {
    return `late-return:${loanId}`;
  }

  static buildLostDedupeKey(loanId: number): string {
    return `lost:${loanId}`;
  }

  static buildDamagedDedupeKey(loanId: number): string {
    return `damaged:${loanId}`;
  }

  /**
   * Idempotently creates a fine.
   * Inserts with ON CONFLICT ("dedupeKey") DO NOTHING.
   * If a row with that key exists, returns it without error and without emitting events.
   */
  async createFine(
    input: CreateFineInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Fine> {
    validateFineAmountMinor(input.amountMinor);

    const client = tx ?? this.prisma;
    const now = this.clockService.now();

    // Raw SQL INSERT with ON CONFLICT DO NOTHING to guarantee concurrency-safe idempotency
    const insertedRows = await client.$queryRaw<Fine[]>`
      INSERT INTO "Fine" (
        "userId",
        "reason",
        "amountMinor",
        "uncappedAmountMinor",
        "capMinor",
        "paidMinor",
        "status",
        "loanId",
        "daysLate",
        "note",
        "dedupeKey",
        "createdById",
        "createdAt"
      ) VALUES (
        ${input.userId},
        ${input.reason}::"FineReason",
        ${input.amountMinor},
        ${input.uncappedAmountMinor ?? null},
        ${input.capMinor ?? null},
        0,
        'UNPAID'::"FineStatus",
        ${input.loanId ?? null},
        ${input.daysLate ?? null},
        ${input.note ?? null},
        ${input.dedupeKey},
        ${input.createdById ?? null},
        ${now}
      )
      ON CONFLICT ("dedupeKey") DO NOTHING
      RETURNING *;
    `;

    if (insertedRows && insertedRows.length > 0) {
      const createdFine = insertedRows[0];
      (createdFine as any).isNew = true;

      if (!tx) {
        this.eventEmitter.emit(
          DOMAIN_EVENT_NAMES.FINE_CREATED,
          new FineCreatedEvent(
            createdFine.id,
            createdFine.userId,
            createdFine.reason,
            createdFine.amountMinor,
            createdFine.loanId,
            now,
          ),
        );
      }

      return createdFine;
    }

    // If conflict occurred, query and return the existing record without error and without events
    const existing = await client.fine.findUniqueOrThrow({
      where: { dedupeKey: input.dedupeKey },
    });
    (existing as any).isNew = false;
    return existing;
  }

  /**
   * Records a fine payment.
   * 1. Reads fine (no lock) to find userId.
   * 2. Acquires member advisory lock.
   * 3. Locks fine row FOR UPDATE.
   * 4. Validates status is UNPAID or PARTIALLY_PAID.
   * 5. Validates payment amount > 0 and <= outstanding balance.
   * 6. Inserts FinePayment, updates paidMinor, status, and settledAt.
   * 7. Emits fine.payment_recorded, and fine.settled (if settled) post-commit.
   */
  async recordPayment(
    fineId: number,
    amountMinor: number,
    staffId: number,
    note?: string,
  ): Promise<Fine> {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new BadRequestException(
        `Payment amount must be a positive integer, received: ${amountMinor}`,
      );
    }

    // Step 1: Read the fine to find the member (no lock)
    const initialFine = await this.prisma.fine.findUnique({
      where: { id: fineId },
    });

    if (!initialFine) {
      throw new FineNotFoundError(fineId);
    }

    // Execute atomic payment within transaction with proper locking order
    const result = await this.prisma.$transaction(async (tx) => {
      // Step 2: Take the member advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_ADVISORY_NAMESPACE}::int, ${initialFine.userId}::int)`;

      // Step 3: Lock the fine row FOR UPDATE
      const lockedRows = await tx.$queryRaw<Fine[]>`
        SELECT * FROM "Fine" WHERE id = ${fineId} FOR UPDATE
      `;
      const fine = lockedRows[0];
      if (!fine) {
        throw new FineNotFoundError(fineId);
      }

      // Step 4: The fine must be UNPAID or PARTIALLY_PAID (else FINE_NOT_PAYABLE)
      if (
        fine.status !== FineStatus.UNPAID &&
        fine.status !== FineStatus.PARTIALLY_PAID
      ) {
        throw new FineNotPayableError(fineId, fine.status);
      }

      // Step 5: The amount must not exceed the outstanding balance (else OVERPAYMENT)
      const outstanding = fine.amountMinor - fine.paidMinor;
      if (amountMinor > outstanding) {
        throw new FineOverpaymentError(amountMinor, outstanding);
      }

      // Step 6: Insert FinePayment and update Fine
      const now = this.clockService.now();
      const newPaidMinor = fine.paidMinor + amountMinor;
      const isSettled = newPaidMinor === fine.amountMinor;
      const newStatus = isSettled ? FineStatus.PAID : FineStatus.PARTIALLY_PAID;

      const payment = await tx.finePayment.create({
        data: {
          fineId: fine.id,
          amountMinor,
          receivedById: staffId,
          note: note ?? null,
          createdAt: now,
        },
      });

      const updatedFine = await tx.fine.update({
        where: { id: fine.id },
        data: {
          paidMinor: newPaidMinor,
          status: newStatus,
          settledAt: isSettled ? now : null,
        },
      });

      return { updatedFine, payment, isSettled, now };
    });

    // Step 7: Emit events post-commit
    this.eventEmitter.emit(
      DOMAIN_EVENT_NAMES.FINE_PAYMENT_RECORDED,
      new FinePaymentRecordedEvent(
        result.updatedFine.id,
        result.payment.id,
        result.updatedFine.userId,
        amountMinor,
        result.updatedFine.paidMinor,
        result.updatedFine.amountMinor - result.updatedFine.paidMinor,
        staffId,
        result.now,
      ),
    );

    if (result.isSettled) {
      this.eventEmitter.emit(
        DOMAIN_EVENT_NAMES.FINE_SETTLED,
        new FineSettledEvent(
          result.updatedFine.id,
          result.updatedFine.userId,
          result.updatedFine.reason,
          result.updatedFine.status,
          result.now,
          result.now,
        ),
      );
    }

    return result.updatedFine;
  }

  /**
   * Waives an unpaid or partially paid fine.
   * Reason is required. Existing payments stay on record.
   * Emits fine.settled post-commit.
   */
  async waiveFine(
    fineId: number,
    reason: string,
    adminId: number,
  ): Promise<Fine> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Waiver reason is required.');
    }

    // Step 1: Read fine to find member (no lock)
    const initialFine = await this.prisma.fine.findUnique({
      where: { id: fineId },
    });

    if (!initialFine) {
      throw new FineNotFoundError(fineId);
    }

    // Step 2 & 3: Transaction with member advisory lock + FOR UPDATE
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_ADVISORY_NAMESPACE}::int, ${initialFine.userId}::int)`;

      const lockedRows = await tx.$queryRaw<Fine[]>`
        SELECT * FROM "Fine" WHERE id = ${fineId} FOR UPDATE
      `;
      const fine = lockedRows[0];
      if (!fine) {
        throw new FineNotFoundError(fineId);
      }

      if (
        fine.status !== FineStatus.UNPAID &&
        fine.status !== FineStatus.PARTIALLY_PAID
      ) {
        throw new FineNotPayableError(fineId, fine.status);
      }

      const now = this.clockService.now();
      const updatedFine = await tx.fine.update({
        where: { id: fine.id },
        data: {
          status: FineStatus.WAIVED,
          waivedById: adminId,
          waivedReason: reason.trim(),
          settledAt: now,
        },
      });

      return { updatedFine, now };
    });

    // Step 4: Emit fine.settled post-commit
    this.eventEmitter.emit(
      DOMAIN_EVENT_NAMES.FINE_SETTLED,
      new FineSettledEvent(
        result.updatedFine.id,
        result.updatedFine.userId,
        result.updatedFine.reason,
        result.updatedFine.status,
        result.now,
        result.now,
      ),
    );

    return result.updatedFine;
  }

  /**
   * Returns a member's fines with outstanding amount per fine and total outstanding amount.
   * Optionally filtered by fine status.
   */
  async getMemberFines(
    userId: number,
    status?: FineStatus,
  ): Promise<MemberFinesResult> {
    const where: Prisma.FineWhereInput = { userId };
    if (status) {
      where.status = status;
    }

    const fines = await this.prisma.fine.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    let totalOutstandingMinor = 0;

    const finesWithOutstanding = fines.map((fine) => {
      const isSettled =
        fine.status === FineStatus.PAID || fine.status === FineStatus.WAIVED;
      const outstandingMinor = isSettled
        ? 0
        : Math.max(0, fine.amountMinor - fine.paidMinor);

      if (!isSettled) {
        totalOutstandingMinor += outstandingMinor;
      }

      return {
        ...fine,
        outstandingMinor,
      };
    });

    return {
      fines: finesWithOutstanding,
      totalOutstandingMinor,
    };
  }

  /**
   * Returns a staff list of fines with optional filters and pagination.
   */
  async listFines(
    filter?: ListFinesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedFinesResult> {
    const where: Prisma.FineWhereInput = {};

    if (filter?.userId !== undefined) {
      where.userId = filter.userId;
    }
    if (filter?.status !== undefined) {
      where.status = filter.status;
    }
    if (filter?.reason !== undefined) {
      where.reason = filter.reason;
    }

    const [items, total] = await Promise.all([
      this.prisma.fine.findMany({
        where,
        skip: pagination?.skip,
        take: pagination?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fine.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Retrieves a single fine with all its payments.
   */
  async getFine(fineId: number): Promise<Fine & { payments: FinePayment[] }> {
    const fine = await this.prisma.fine.findUnique({
      where: { id: fineId },
      include: {
        payments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!fine) {
      throw new FineNotFoundError(fineId);
    }

    return fine;
  }

  /**
   * FinesPublicApi: Retrieves all outstanding (UNPAID or PARTIALLY_PAID) fines for a member.
   */
  async getOutstandingFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Fine[]> {
    const client = tx ?? this.prisma;
    return client.fine.findMany({
      where: {
        userId,
        status: { in: [FineStatus.UNPAID, FineStatus.PARTIALLY_PAID] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * FinesPublicApi: Computes the total outstanding fine balance for a member in minor units.
   */
  async getOutstandingTotalMinor(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const outstandingFines = await this.getOutstandingFines(userId, tx);
    return outstandingFines.reduce(
      (sum, fine) => sum + Math.max(0, fine.amountMinor - fine.paidMinor),
      0,
    );
  }
}
