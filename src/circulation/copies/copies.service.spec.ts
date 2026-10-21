import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Copy, CopyStatus, CopyStatusHistory } from '@prisma/client';
import { BooksService } from '../../books';
import { PrismaService } from '../../prisma/prisma.service';
import { CopiesService } from './copies.service';
import { CopyStatusConflictError } from './errors/copy-status-conflict.error';
import { DuplicateBarcodeError } from './errors/duplicate-barcode.error';
import { InvalidCopyStateTransitionError } from './errors/invalid-copy-state-transition.error';
import {
  CopyCreatedEvent,
  CopyStatusChangedEvent,
  CopyRetiredEvent,
} from './events';

describe('CopiesService', () => {
  let service: CopiesService;
  let prisma: any;
  let booksService: any;
  let eventEmitter: { emit: jest.Mock };

  const mockCopy: Copy = {
    id: 1,
    bookId: 10,
    barcode: 'BD-000001',
    status: CopyStatus.AVAILABLE,
    shelfLocation: 'STACK-A',
    notes: 'Pristine copy',
    retiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockHistory: CopyStatusHistory = {
    id: 100,
    copyId: 1,
    fromStatus: null,
    toStatus: CopyStatus.AVAILABLE,
    reason: 'Initial copy inventory',
    changedById: 42,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      copy: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        groupBy: jest.fn(),
      },
      copyStatusHistory: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    booksService = {
      exists: jest.fn(),
      findById: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: BooksService, useValue: booksService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<CopiesService>(CopiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addCopy', () => {
    it('throws NotFoundException if the book does not exist in the Catalog', async () => {
      booksService.exists.mockResolvedValue(false);

      await expect(service.addCopy(999)).rejects.toThrow(NotFoundException);
      expect(booksService.exists).toHaveBeenCalledWith(999);
      expect(prisma.copy.create).not.toHaveBeenCalled();
    });

    it('throws DuplicateBarcodeError if a custom barcode is provided and already exists', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.copy.findUnique.mockResolvedValue(mockCopy);

      await expect(service.addCopy(10, 'BD-000001')).rejects.toThrow(
        DuplicateBarcodeError,
      );
      expect(prisma.copy.create).not.toHaveBeenCalled();
    });

    it('creates copy and history with auto-generated barcode via nextval when barcode is omitted', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ nextval: 42 }]);
      prisma.copy.create.mockResolvedValue({
        ...mockCopy,
        id: 42,
        barcode: 'BD-000042',
      });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      const result = await service.addCopy(
        10,
        undefined,
        'STACK-B',
        'Gift copy',
        99,
      );

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.copy.create).toHaveBeenCalledWith({
        data: {
          id: 42,
          bookId: 10,
          barcode: 'BD-000042',
          shelfLocation: 'STACK-B',
          notes: 'Gift copy',
          status: CopyStatus.AVAILABLE,
        },
      });
      expect(prisma.copyStatusHistory.create).toHaveBeenCalledWith({
        data: {
          copyId: 42,
          fromStatus: null,
          toStatus: CopyStatus.AVAILABLE,
          reason: 'Initial copy inventory',
          changedById: 99,
        },
      });
      expect(result.barcode).toBe('BD-000042');
    });

    it('creates copy with custom barcode when barcode is unique', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.copy.findUnique.mockResolvedValue(null);
      prisma.copy.create.mockResolvedValue({
        ...mockCopy,
        barcode: 'CUSTOM-123',
      });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      const result = await service.addCopy(
        10,
        'CUSTOM-123',
        'SHELF-1',
        undefined,
        5,
      );

      expect(prisma.copy.create).toHaveBeenCalledWith({
        data: {
          bookId: 10,
          barcode: 'CUSTOM-123',
          shelfLocation: 'SHELF-1',
          notes: null,
          status: CopyStatus.AVAILABLE,
        },
      });
      expect(result.barcode).toBe('CUSTOM-123');
    });
  });

  describe('addCopies', () => {
    it.each([0, 51, -1, 2.5])(
      'throws BadRequestException when quantity is invalid: %p',
      async (quantity) => {
        await expect(service.addCopies(10, quantity)).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('throws NotFoundException if the book does not exist', async () => {
      booksService.exists.mockResolvedValue(false);

      await expect(service.addCopies(999, 3)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates multiple copies in a single transaction with generated barcodes', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.$queryRaw
        .mockResolvedValueOnce([{ nextval: 1 }])
        .mockResolvedValueOnce([{ nextval: 2 }]);

      prisma.copy.create
        .mockResolvedValueOnce({ ...mockCopy, id: 1, barcode: 'BD-000001' })
        .mockResolvedValueOnce({ ...mockCopy, id: 2, barcode: 'BD-000002' });

      const copies = await service.addCopies(10, 2, 'SHELF-10', 1);

      expect(copies).toHaveLength(2);
      expect(prisma.copy.create).toHaveBeenCalledTimes(2);
      expect(prisma.copyStatusHistory.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateCopy', () => {
    it('throws NotFoundException if copy is not found', async () => {
      prisma.copy.findUnique.mockResolvedValue(null);

      await expect(service.updateCopy(999, 'NEW-SHELF')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws InvalidCopyStateTransitionError if copy is retired', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        retiredAt: new Date(),
      });

      await expect(service.updateCopy(1, 'NEW-SHELF')).rejects.toThrow(
        InvalidCopyStateTransitionError,
      );
    });

    it('updates shelfLocation and notes on active copy', async () => {
      prisma.copy.findUnique.mockResolvedValue(mockCopy);
      prisma.copy.update.mockResolvedValue({
        ...mockCopy,
        shelfLocation: 'ROW-4',
        notes: 'Updated condition',
      });

      const updated = await service.updateCopy(1, 'ROW-4', 'Updated condition');

      expect(prisma.copy.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          shelfLocation: 'ROW-4',
          notes: 'Updated condition',
        },
      });
      expect(updated.shelfLocation).toBe('ROW-4');
    });
  });

  describe('changeStatus', () => {
    it.each([CopyStatus.LOST, CopyStatus.DAMAGED])(
      'throws BadRequestException when transitioning to %s without a reason',
      async (status) => {
        await expect(service.changeStatus(1, status, '')).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('throws NotFoundException if copy does not exist', async () => {
      prisma.copy.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus(999, CopyStatus.LOST, 'Accidentally misplaced'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws InvalidCopyStateTransitionError for forbidden manual transition', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.AVAILABLE,
      });

      await expect(
        service.changeStatus(1, CopyStatus.BORROWED, 'Manual loan'),
      ).rejects.toThrow(InvalidCopyStateTransitionError);
    });

    it('successfully transitions from AVAILABLE to LOST with reason', async () => {
      prisma.copy.findUnique.mockResolvedValue(mockCopy);
      prisma.copy.updateMany.mockResolvedValue({ count: 1 });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);
      prisma.copy.findUniqueOrThrow.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.LOST,
      });

      const result = await service.changeStatus(
        1,
        CopyStatus.LOST,
        'Member lost it on bus',
        88,
      );

      expect(result.status).toBe(CopyStatus.LOST);
      expect(prisma.copyStatusHistory.create).toHaveBeenCalledWith({
        data: {
          copyId: 1,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.LOST,
          reason: 'Member lost it on bus',
          changedById: 88,
        },
      });
    });
  });

  describe('retireCopy', () => {
    it('throws NotFoundException if copy is not found', async () => {
      prisma.copy.findUnique.mockResolvedValue(null);

      await expect(service.retireCopy(999)).rejects.toThrow(NotFoundException);
    });

    it('throws InvalidCopyStateTransitionError if copy is already retired', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        retiredAt: new Date(),
      });

      await expect(service.retireCopy(1)).rejects.toThrow(
        InvalidCopyStateTransitionError,
      );
    });

    it.each([CopyStatus.ON_HOLD, CopyStatus.BORROWED])(
      'throws InvalidCopyStateTransitionError if copy status is %s',
      async (status) => {
        prisma.copy.findUnique.mockResolvedValue({
          ...mockCopy,
          status,
        });

        await expect(service.retireCopy(1)).rejects.toThrow(
          InvalidCopyStateTransitionError,
        );
      },
    );

    it('successfully soft-retires an available copy and records audit history', async () => {
      prisma.copy.findUnique.mockResolvedValue(mockCopy);
      prisma.copy.update.mockResolvedValue({
        ...mockCopy,
        retiredAt: new Date(),
      });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      const retired = await service.retireCopy(
        1,
        'Water damage beyond repair',
        42,
      );

      expect(prisma.copy.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { retiredAt: expect.any(Date) },
      });
      expect(prisma.copyStatusHistory.create).toHaveBeenCalledWith({
        data: {
          copyId: 1,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.AVAILABLE,
          reason: 'Water damage beyond repair',
          changedById: 42,
        },
      });
      expect(retired.retiredAt).toBeDefined();
    });
  });

  describe('transitionStatus (Atomic Compare-and-Set)', () => {
    it('throws NotFoundException if copy does not exist', async () => {
      prisma.copy.findUnique.mockResolvedValue(null);

      await expect(
        service.transitionStatus(
          999,
          [CopyStatus.AVAILABLE],
          CopyStatus.BORROWED,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws InvalidCopyStateTransitionError if copy is retired', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        retiredAt: new Date(),
      });

      await expect(
        service.transitionStatus(
          1,
          [CopyStatus.AVAILABLE],
          CopyStatus.BORROWED,
        ),
      ).rejects.toThrow(InvalidCopyStateTransitionError);
    });

    it('throws CopyStatusConflictError when conditional update fails due to concurrent modification', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.BORROWED, // already changed concurrently
      });
      prisma.copy.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.transitionStatus(
          1,
          [CopyStatus.AVAILABLE, CopyStatus.ON_HOLD],
          CopyStatus.BORROWED,
        ),
      ).rejects.toThrow(CopyStatusConflictError);
    });

    it('atomically updates status and writes history on match', async () => {
      prisma.copy.findUnique.mockResolvedValue(mockCopy);
      prisma.copy.updateMany.mockResolvedValue({ count: 1 });
      prisma.copy.findUniqueOrThrow.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.ON_HOLD,
      });

      const result = await service.transitionStatus(
        1,
        [CopyStatus.AVAILABLE],
        CopyStatus.ON_HOLD,
        { reason: 'Hold placed by queue', changedById: 7 },
      );

      expect(prisma.copy.updateMany).toHaveBeenCalledWith({
        where: {
          id: 1,
          status: { in: [CopyStatus.AVAILABLE] },
          retiredAt: null,
        },
        data: {
          status: CopyStatus.ON_HOLD,
        },
      });
      expect(prisma.copyStatusHistory.create).toHaveBeenCalledWith({
        data: {
          copyId: 1,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.ON_HOLD,
          reason: 'Hold placed by queue',
          changedById: 7,
        },
      });
      expect(result.status).toBe(CopyStatus.ON_HOLD);
    });
  });

  describe('Read Methods', () => {
    describe('findById', () => {
      it('returns copy if found', async () => {
        prisma.copy.findUnique.mockResolvedValue(mockCopy);
        const result = await service.findById(1);
        expect(result).toEqual(mockCopy);
      });

      it('throws NotFoundException if not found', async () => {
        prisma.copy.findUnique.mockResolvedValue(null);
        await expect(service.findById(999)).rejects.toThrow(NotFoundException);
      });
    });

    describe('findByBarcode', () => {
      it('returns copy when barcode matches', async () => {
        prisma.copy.findUnique.mockResolvedValue(mockCopy);
        const result = await service.findByBarcode('BD-000001');
        expect(result.barcode).toBe('BD-000001');
      });

      it('throws BadRequestException if barcode is empty', async () => {
        await expect(service.findByBarcode('   ')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('throws NotFoundException if barcode is not found', async () => {
        prisma.copy.findUnique.mockResolvedValue(null);
        await expect(service.findByBarcode('BD-999999')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('listCopies', () => {
      it('applies default pagination and filters out retired copies by default', async () => {
        prisma.copy.findMany.mockResolvedValue([mockCopy]);

        const result = await service.listCopies({ bookId: 10 });

        expect(prisma.copy.findMany).toHaveBeenCalledWith({
          where: {
            bookId: 10,
            retiredAt: null,
          },
          skip: 0,
          take: 20,
          orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(1);
      });

      it('includes retired copies when includeRetired is true', async () => {
        prisma.copy.findMany.mockResolvedValue([mockCopy]);

        await service.listCopies({ includeRetired: true, take: 50, skip: 10 });

        expect(prisma.copy.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 10,
          take: 50,
          orderBy: { id: 'asc' },
        });
      });
    });

    describe('getStatusHistory', () => {
      it('returns copy status history ordered by createdAt desc', async () => {
        prisma.copy.findUnique.mockResolvedValue(mockCopy);
        prisma.copyStatusHistory.findMany.mockResolvedValue([mockHistory]);

        const history = await service.getStatusHistory(1);

        expect(history).toEqual([mockHistory]);
        expect(prisma.copyStatusHistory.findMany).toHaveBeenCalledWith({
          where: { copyId: 1 },
          orderBy: { createdAt: 'desc' },
        });
      });

      it('throws NotFoundException if copy does not exist', async () => {
        prisma.copy.findUnique.mockResolvedValue(null);

        await expect(service.getStatusHistory(999)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  describe('Domain Events (In-Process Publishing)', () => {
    it('publishes copy.created event after addCopy commits transaction', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ nextval: 10 }]);
      prisma.copy.create.mockResolvedValue({
        ...mockCopy,
        id: 10,
        barcode: 'BD-000010',
        shelfLocation: 'ROW-1',
      });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      await service.addCopy(10, undefined, 'ROW-1', undefined, 42);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        CopyCreatedEvent.EVENT_NAME,
        expect.objectContaining({
          copyId: 10,
          bookId: 10,
          barcode: 'BD-000010',
          status: CopyStatus.AVAILABLE,
          shelfLocation: 'ROW-1',
          actorId: 42,
          occurredAt: expect.any(Date),
        }),
      );
    });

    it('does NOT publish copy.created event if addCopy fails before or during transaction', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.copy.findUnique.mockResolvedValue(mockCopy); // triggers DuplicateBarcodeError

      await expect(service.addCopy(10, 'BD-000001')).rejects.toThrow(
        DuplicateBarcodeError,
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('publishes copy.created events for every copy in addCopies batch after commit', async () => {
      booksService.exists.mockResolvedValue(true);
      prisma.$queryRaw
        .mockResolvedValueOnce([{ nextval: 1 }])
        .mockResolvedValueOnce([{ nextval: 2 }]);
      prisma.copy.create
        .mockResolvedValueOnce({
          ...mockCopy,
          id: 1,
          barcode: 'BD-000001',
          shelfLocation: 'STACK-B',
        })
        .mockResolvedValueOnce({
          ...mockCopy,
          id: 2,
          barcode: 'BD-000002',
          shelfLocation: 'STACK-B',
        });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      await service.addCopies(10, 2, 'STACK-B', 99);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenNthCalledWith(
        1,
        CopyCreatedEvent.EVENT_NAME,
        expect.objectContaining({
          copyId: 1,
          bookId: 10,
          barcode: 'BD-000001',
          status: CopyStatus.AVAILABLE,
          shelfLocation: 'STACK-B',
          actorId: 99,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenNthCalledWith(
        2,
        CopyCreatedEvent.EVENT_NAME,
        expect.objectContaining({
          copyId: 2,
          bookId: 10,
          barcode: 'BD-000002',
          status: CopyStatus.AVAILABLE,
          shelfLocation: 'STACK-B',
          actorId: 99,
        }),
      );
    });

    it('publishes copy.status_changed event on transitionStatus compare-and-set', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.AVAILABLE,
      });
      prisma.copy.updateMany.mockResolvedValue({ count: 1 });
      prisma.copy.findUniqueOrThrow.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.LOST,
      });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      await service.transitionStatus(
        1,
        [CopyStatus.AVAILABLE],
        CopyStatus.LOST,
        { reason: 'Lost by reader', changedById: 88 },
      );

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        CopyStatusChangedEvent.EVENT_NAME,
        expect.objectContaining({
          copyId: 1,
          bookId: 10,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.LOST,
          reason: 'Lost by reader',
          actorId: 88,
          occurredAt: expect.any(Date),
        }),
      );
    });

    it('does NOT publish copy.status_changed event on compare-and-set conflict', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.BORROWED,
      });
      prisma.copy.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.transitionStatus(1, [CopyStatus.AVAILABLE], CopyStatus.LOST),
      ).rejects.toThrow(CopyStatusConflictError);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('publishes copy.retired event after retireCopy transaction commits', async () => {
      const retiredDate = new Date();
      prisma.copy.findUnique.mockResolvedValue(mockCopy);
      prisma.copy.update.mockResolvedValue({
        ...mockCopy,
        retiredAt: retiredDate,
      });
      prisma.copyStatusHistory.create.mockResolvedValue(mockHistory);

      await service.retireCopy(1, 'Damaged copy', 55);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        CopyRetiredEvent.EVENT_NAME,
        expect.objectContaining({
          copyId: 1,
          bookId: 10,
          reason: 'Damaged copy',
          retiredAt: retiredDate,
          actorId: 55,
          occurredAt: expect.any(Date),
        }),
      );
    });

    it('does NOT publish copy.retired event if copy is already retired', async () => {
      prisma.copy.findUnique.mockResolvedValue({
        ...mockCopy,
        retiredAt: new Date(),
      });

      await expect(service.retireCopy(1)).rejects.toThrow(
        InvalidCopyStateTransitionError,
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
