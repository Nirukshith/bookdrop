import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Copy, CopyStatus, CopyStatusHistory, Prisma } from '@prisma/client';
import { BooksService } from '../../books';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertCanRetireCopy,
  assertValidManualTransition,
} from './copy-state-machine';
import { CopyStatusConflictError } from './errors/copy-status-conflict.error';
import { DuplicateBarcodeError } from './errors/duplicate-barcode.error';
import { InvalidCopyStateTransitionError } from './errors/invalid-copy-state-transition.error';
import {
  CopiesPublicApi,
  CopyPublicObject,
} from './copies-public-api.interface';
import {
  CopyCreatedEvent,
  CopyStatusChangedEvent,
  CopyRetiredEvent,
} from './events';

export interface TransitionStatusMeta {
  reason?: string;
  changedById?: number;
}

export interface ListCopiesFilter {
  bookId?: number;
  status?: CopyStatus;
  includeRetired?: boolean;
  skip?: number;
  take?: number;
}

@Injectable()
export class CopiesService implements CopiesPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booksService: BooksService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Generates a standardized barcode in the format BD-000001 using PostgreSQL sequence nextval.
   */
  private async getNextSequenceBarcode(
    tx: Prisma.TransactionClient,
  ): Promise<{ nextId: number; barcode: string }> {
    const rawResult = await tx.$queryRaw<
      Array<{ nextval: bigint | number | string }>
    >`
      SELECT nextval(pg_get_serial_sequence('"Copy"', 'id'))
    `;
    const nextId = Number(rawResult[0].nextval);
    const barcode = `BD-${String(nextId).padStart(6, '0')}`;
    return { nextId, barcode };
  }

  /**
   * 1. addCopy: Adds a single copy. If no barcode is provided, generates BD- plus padded ID inside a transaction.
   * Verifies book existence through Catalog's public interface. Records history entry.
   */
  async addCopy(
    bookId: number,
    barcode?: string,
    shelfLocation?: string,
    notes?: string,
    actorId?: number,
  ): Promise<Copy> {
    const bookExists = await this.booksService.exists(bookId);
    if (!bookExists) {
      throw new NotFoundException(`Book with ID ${bookId} not found.`);
    }

    let copy: Copy;

    if (barcode && barcode.trim().length > 0) {
      const trimmedBarcode = barcode.trim();
      const existing = await this.prisma.copy.findUnique({
        where: { barcode: trimmedBarcode },
      });
      if (existing) {
        throw new DuplicateBarcodeError(trimmedBarcode);
      }

      copy = await this.prisma.$transaction(async (tx) => {
        const created = await tx.copy.create({
          data: {
            bookId,
            barcode: trimmedBarcode,
            shelfLocation: shelfLocation?.trim() || null,
            notes: notes?.trim() || null,
            status: CopyStatus.AVAILABLE,
          },
        });

        await tx.copyStatusHistory.create({
          data: {
            copyId: created.id,
            fromStatus: null,
            toStatus: CopyStatus.AVAILABLE,
            reason: 'Initial copy inventory',
            changedById: actorId ?? null,
          },
        });

        return created;
      });
    } else {
      copy = await this.prisma.$transaction(async (tx) => {
        const { nextId, barcode: autoBarcode } =
          await this.getNextSequenceBarcode(tx);

        const created = await tx.copy.create({
          data: {
            id: nextId,
            bookId,
            barcode: autoBarcode,
            shelfLocation: shelfLocation?.trim() || null,
            notes: notes?.trim() || null,
            status: CopyStatus.AVAILABLE,
          },
        });

        await tx.copyStatusHistory.create({
          data: {
            copyId: created.id,
            fromStatus: null,
            toStatus: CopyStatus.AVAILABLE,
            reason: 'Initial copy inventory',
            changedById: actorId ?? null,
          },
        });

        return created;
      });
    }

    this.eventEmitter.emit(
      CopyCreatedEvent.EVENT_NAME,
      new CopyCreatedEvent(
        copy.id,
        copy.bookId,
        copy.barcode,
        copy.status,
        copy.shelfLocation,
        actorId ?? null,
        copy.createdAt,
      ),
    );

    return copy;
  }

  /**
   * 2. addCopies: Adds between 1 and 50 copies in one transaction with auto-generated barcodes.
   */
  async addCopies(
    bookId: number,
    quantity: number,
    shelfLocation?: string,
    actorId?: number,
  ): Promise<Copy[]> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new BadRequestException(
        'Quantity must be an integer between 1 and 50.',
      );
    }

    const bookExists = await this.booksService.exists(bookId);
    if (!bookExists) {
      throw new NotFoundException(`Book with ID ${bookId} not found.`);
    }

    const createdCopies = await this.prisma.$transaction(async (tx) => {
      const copies: Copy[] = [];

      for (let i = 0; i < quantity; i++) {
        const { nextId, barcode } = await this.getNextSequenceBarcode(tx);

        const created = await tx.copy.create({
          data: {
            id: nextId,
            bookId,
            barcode,
            shelfLocation: shelfLocation?.trim() || null,
            status: CopyStatus.AVAILABLE,
          },
        });

        await tx.copyStatusHistory.create({
          data: {
            copyId: created.id,
            fromStatus: null,
            toStatus: CopyStatus.AVAILABLE,
            reason: 'Initial copy inventory',
            changedById: actorId ?? null,
          },
        });

        copies.push(created);
      }

      return copies;
    });

    for (const copy of createdCopies) {
      this.eventEmitter.emit(
        CopyCreatedEvent.EVENT_NAME,
        new CopyCreatedEvent(
          copy.id,
          copy.bookId,
          copy.barcode,
          copy.status,
          copy.shelfLocation,
          actorId ?? null,
          copy.createdAt,
        ),
      );
    }

    return createdCopies;
  }

  /**
   * 3. updateCopy: Updates shelfLocation and/or notes on an existing active copy.
   */
  async updateCopy(
    id: number,
    shelfLocation?: string | null,
    notes?: string | null,
  ): Promise<Copy> {
    const copy = await this.prisma.copy.findUnique({
      where: { id },
    });

    if (!copy) {
      throw new NotFoundException(`Copy with ID ${id} not found.`);
    }

    if (copy.retiredAt !== null) {
      throw new InvalidCopyStateTransitionError(
        'Retired copies cannot be updated.',
      );
    }

    return this.prisma.copy.update({
      where: { id },
      data: {
        shelfLocation:
          shelfLocation !== undefined
            ? shelfLocation?.trim() || null
            : copy.shelfLocation,
        notes: notes !== undefined ? notes?.trim() || null : copy.notes,
      },
    });
  }

  /**
   * 4. changeStatus: Manual status transitions (AVAILABLE <-> LOST, AVAILABLE <-> DAMAGED, LOST <-> DAMAGED).
   * Validates state rules and enforces required reasons for LOST and DAMAGED.
   */
  async changeStatus(
    copyId: number,
    to: CopyStatus,
    reason?: string,
    actorId?: number,
  ): Promise<Copy> {
    const trimmedReason = reason?.trim();
    if (to === CopyStatus.LOST || to === CopyStatus.DAMAGED) {
      if (!trimmedReason || trimmedReason.length === 0) {
        throw new BadRequestException(
          `A reason is required when marking a copy as '${to}'.`,
        );
      }
    }

    const copy = await this.prisma.copy.findUnique({
      where: { id: copyId },
    });

    if (!copy) {
      throw new NotFoundException(`Copy with ID ${copyId} not found.`);
    }

    assertValidManualTransition(
      {
        status: copy.status,
        isRetired: copy.retiredAt !== null,
      },
      to,
    );

    return this.transitionStatus(copyId, [copy.status], to, {
      reason: trimmedReason,
      changedById: actorId,
    });
  }

  /**
   * 5. retireCopy: Soft-retires a copy by setting retiredAt. Never hard-deletes.
   * Records a history entry capturing reason and actor.
   */
  async retireCopy(
    id: number,
    reason?: string,
    actorId?: number,
  ): Promise<Copy> {
    const copy = await this.prisma.copy.findUnique({
      where: { id },
    });

    if (!copy) {
      throw new NotFoundException(`Copy with ID ${id} not found.`);
    }

    assertCanRetireCopy({
      status: copy.status,
      isRetired: copy.retiredAt !== null,
    });

    const trimmedReason = reason?.trim() || 'Copy retired from circulation';

    const retiredCopy = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.copy.update({
        where: { id },
        data: {
          retiredAt: new Date(),
        },
      });

      await tx.copyStatusHistory.create({
        data: {
          copyId: id,
          fromStatus: copy.status,
          toStatus: copy.status,
          reason: trimmedReason,
          changedById: actorId ?? null,
        },
      });

      return updated;
    });

    this.eventEmitter.emit(
      CopyRetiredEvent.EVENT_NAME,
      new CopyRetiredEvent(
        retiredCopy.id,
        retiredCopy.bookId,
        trimmedReason,
        retiredCopy.retiredAt!,
        actorId ?? null,
        new Date(),
      ),
    );

    return retiredCopy;
  }

  /**
   * 6. transitionStatus: Atomic compare-and-set conditional status transition.
   * Succeeds only if current status is in allowedFrom and copy is not retired.
   * Writes the history row in the same transaction.
   */
  async transitionStatus(
    copyId: number,
    allowedFrom: CopyStatus[],
    to: CopyStatus,
    meta?: TransitionStatusMeta,
    tx?: Prisma.TransactionClient,
  ): Promise<Copy> {
    const executeInTx = async (client: Prisma.TransactionClient) => {
      const current = await client.copy.findUnique({
        where: { id: copyId },
      });

      if (!current) {
        throw new NotFoundException(`Copy with ID ${copyId} not found.`);
      }

      if (current.retiredAt !== null) {
        throw new InvalidCopyStateTransitionError(
          'Retired copies accept no status changes.',
        );
      }

      const updateResult = await client.copy.updateMany({
        where: {
          id: copyId,
          status: { in: allowedFrom },
          retiredAt: null,
        },
        data: {
          status: to,
        },
      });

      if (updateResult.count === 0) {
        throw new CopyStatusConflictError(
          `Cannot transition copy ${copyId} to '${to}'. Current status '${current.status}' is not in allowed source statuses: [${allowedFrom.join(', ')}].`,
        );
      }

      await client.copyStatusHistory.create({
        data: {
          copyId,
          fromStatus: current.status,
          toStatus: to,
          reason: meta?.reason?.trim() || null,
          changedById: meta?.changedById ?? null,
        },
      });

      const updated = await client.copy.findUniqueOrThrow({
        where: { id: copyId },
      });

      return { updatedCopy: updated, previousStatus: current.status };
    };

    const { updatedCopy, previousStatus } = tx
      ? await executeInTx(tx)
      : await this.prisma.$transaction(executeInTx);

    this.eventEmitter.emit(
      CopyStatusChangedEvent.EVENT_NAME,
      new CopyStatusChangedEvent(
        updatedCopy.id,
        updatedCopy.bookId,
        previousStatus,
        updatedCopy.status,
        meta?.reason?.trim() || null,
        meta?.changedById ?? null,
        new Date(),
      ),
    );

    return updatedCopy;
  }

  /**
   * 7. Read methods: findById, findByBarcode, listCopies, getStatusHistory
   */
  async findById(id: number): Promise<Copy> {
    const copy = await this.prisma.copy.findUnique({
      where: { id },
    });

    if (!copy) {
      throw new NotFoundException(`Copy with ID ${id} not found.`);
    }

    return copy;
  }

  async findByBarcode(barcode: string): Promise<Copy> {
    const trimmed = barcode?.trim();
    if (!trimmed) {
      throw new BadRequestException('Barcode cannot be empty.');
    }

    const copy = await this.prisma.copy.findUnique({
      where: { barcode: trimmed },
    });

    if (!copy) {
      throw new NotFoundException(`Copy with barcode '${trimmed}' not found.`);
    }

    return copy;
  }

  async listCopies(filter: ListCopiesFilter = {}): Promise<Copy[]> {
    const {
      bookId,
      status,
      includeRetired = false,
      skip = 0,
      take = 20,
    } = filter;

    const safeTake = Math.min(Math.max(take, 1), 100);
    const safeSkip = Math.max(skip, 0);

    const where: Prisma.CopyWhereInput = {};

    if (bookId !== undefined) {
      where.bookId = bookId;
    }

    if (status !== undefined) {
      where.status = status;
    }

    if (!includeRetired) {
      where.retiredAt = null;
    }

    return this.prisma.copy.findMany({
      where,
      skip: safeSkip,
      take: safeTake,
      orderBy: { id: 'asc' },
    });
  }

  async getStatusHistory(copyId: number): Promise<CopyStatusHistory[]> {
    await this.findById(copyId);

    return this.prisma.copyStatusHistory.findMany({
      where: { copyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- CopiesPublicApi Implementation ---

  /**
   * Batched query returning a Map of bookId -> count of AVAILABLE, non-retired copies.
   * Guarantees every requested bookId exists in the Map with at least 0.
   * Solves the N+1 query problem by executing exactly one database aggregation.
   */
  async availableCountsForBooks(
    bookIds: number[],
  ): Promise<Map<number, number>> {
    const countsMap = new Map<number, number>();
    if (!bookIds || bookIds.length === 0) {
      return countsMap;
    }

    const uniqueIds = Array.from(new Set(bookIds));
    for (const id of uniqueIds) {
      countsMap.set(id, 0);
    }

    const groupedCounts = await this.prisma.copy.groupBy({
      by: ['bookId'],
      where: {
        bookId: { in: uniqueIds },
        status: CopyStatus.AVAILABLE,
        retiredAt: null,
      },
      _count: {
        _all: true,
      },
    });

    for (const row of groupedCounts) {
      countsMap.set(row.bookId, row._count._all);
    }

    return countsMap;
  }

  /**
   * Plain object lookup by ID for public/cross-module consumers (no Prisma relations).
   * Returns null if not found.
   */
  async getCopy(id: number): Promise<CopyPublicObject | null> {
    const copy = await this.prisma.copy.findUnique({
      where: { id },
    });
    if (!copy) {
      return null;
    }
    return this.mapToPublicObject(copy);
  }

  /**
   * Plain object lookup by barcode for public/cross-module consumers (no Prisma relations).
   * Returns null if not found.
   */
  async getCopyByBarcode(barcode: string): Promise<CopyPublicObject | null> {
    const trimmed = barcode?.trim();
    if (!trimmed) {
      return null;
    }
    const copy = await this.prisma.copy.findUnique({
      where: { barcode: trimmed },
    });
    if (!copy) {
      return null;
    }
    return this.mapToPublicObject(copy);
  }

  /**
   * Staff-only query returning counts broken down by status for a specific book.
   */
  async copyCountsForBook(bookId: number): Promise<{
    total: number;
    available: number;
    onHold: number;
    borrowed: number;
    lost: number;
    damaged: number;
  }> {
    const grouped = await this.prisma.copy.groupBy({
      by: ['status'],
      where: {
        bookId,
        retiredAt: null,
      },
      _count: {
        _all: true,
      },
    });

    const counts = {
      total: 0,
      available: 0,
      onHold: 0,
      borrowed: 0,
      lost: 0,
      damaged: 0,
    };

    for (const row of grouped) {
      const cnt = row._count._all;
      counts.total += cnt;
      if (row.status === CopyStatus.AVAILABLE) counts.available = cnt;
      if (row.status === CopyStatus.ON_HOLD) counts.onHold = cnt;
      if (row.status === CopyStatus.BORROWED) counts.borrowed = cnt;
      if (row.status === CopyStatus.LOST) counts.lost = cnt;
      if (row.status === CopyStatus.DAMAGED) counts.damaged = cnt;
    }

    return counts;
  }

  private mapToPublicObject(copy: Copy): CopyPublicObject {
    return {
      id: copy.id,
      bookId: copy.bookId,
      barcode: copy.barcode,
      status: copy.status,
      shelfLocation: copy.shelfLocation,
      notes: copy.notes,
      retiredAt: copy.retiredAt,
      createdAt: copy.createdAt,
      updatedAt: copy.updatedAt,
    };
  }
}
