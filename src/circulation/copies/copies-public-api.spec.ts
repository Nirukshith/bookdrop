import { Test, TestingModule } from '@nestjs/testing';
import { CopyStatus } from '@prisma/client';
import { BooksService } from '../../books';
import { PrismaService } from '../../prisma/prisma.service';
import { CopiesDataLoader } from './copies.loader';
import { CopiesService } from './copies.service';

describe('CopiesPublicApi & DataLoader (Step 4 & N+1 Prevention)', () => {
  let service: CopiesService;
  let loader: CopiesDataLoader;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      copy: {
        findUnique: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopiesService,
        CopiesDataLoader,
        { provide: PrismaService, useValue: prisma },
        { provide: BooksService, useValue: { exists: jest.fn() } },
      ],
    }).compile();

    service = module.get<CopiesService>(CopiesService);
    loader = await module.resolve<CopiesDataLoader>(CopiesDataLoader);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('availableCountsForBooks (Batching Proof)', () => {
    it('PROVES N+1 PREVENTION: listing 20 books triggers exactly ONE copy-count query, not 20', async () => {
      const twentyBookIds = Array.from({ length: 20 }, (_, i) => i + 1);

      // Simulate database aggregation returning counts for only 3 of the books
      prisma.copy.groupBy.mockResolvedValue([
        { bookId: 1, _count: { _all: 4 } },
        { bookId: 5, _count: { _all: 2 } },
        { bookId: 20, _count: { _all: 1 } },
      ]);

      const countsMap = await service.availableCountsForBooks(twentyBookIds);

      // Verify exactly ONE database query was executed for all 20 books
      expect(prisma.copy.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.copy.groupBy).toHaveBeenCalledWith({
        by: ['bookId'],
        where: {
          bookId: { in: twentyBookIds },
          status: CopyStatus.AVAILABLE,
          retiredAt: null,
        },
        _count: { _all: true },
      });

      // Verify Map guarantees: all 20 book IDs exist, defaulting to 0
      expect(countsMap.size).toBe(20);
      expect(countsMap.get(1)).toBe(4);
      expect(countsMap.get(5)).toBe(2);
      expect(countsMap.get(20)).toBe(1);
      expect(countsMap.get(2)).toBe(0);
      expect(countsMap.get(19)).toBe(0);
    });

    it('returns empty map without database query when input is empty', async () => {
      const result = await service.availableCountsForBooks([]);
      expect(result.size).toBe(0);
      expect(prisma.copy.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('CopiesDataLoader (Field Resolver Coalescing)', () => {
    it('coalesces 20 simultaneous load calls into a single batched query', async () => {
      const twentyBookIds = Array.from({ length: 20 }, (_, i) => i + 1);

      prisma.copy.groupBy.mockResolvedValue([
        { bookId: 2, _count: { _all: 5 } },
      ]);

      // Simulate 20 individual @ResolveField calls executing concurrently
      const promises = twentyBookIds.map((id) => loader.loadAvailableCount(id));
      const results = await Promise.all(promises);

      // DataLoader coalesced all 20 into 1 batch execution
      expect(prisma.copy.groupBy).toHaveBeenCalledTimes(1);
      expect(results[1]).toBe(5); // bookId 2 has count 5
      expect(results[0]).toBe(0); // bookId 1 has count 0
    });
  });

  describe('getCopy & getCopyByBarcode (Plain Objects without relations)', () => {
    it('returns a plain scalar object without Prisma relations', async () => {
      const mockRawPrismaCopy = {
        id: 10,
        bookId: 5,
        barcode: 'BD-000010',
        status: CopyStatus.AVAILABLE,
        shelfLocation: 'ROW-1',
        notes: 'Good condition',
        retiredAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        // Even if raw Prisma object had attached relations, they are stripped
        book: { title: 'Secret internal book' },
        history: [{ id: 1 }],
      };

      prisma.copy.findUnique.mockResolvedValue(mockRawPrismaCopy);

      const copy = await service.getCopy(10);

      expect(copy).toBeDefined();
      expect(copy?.id).toBe(10);
      expect(copy?.barcode).toBe('BD-000010');
      expect((copy as any).book).toBeUndefined();
      expect((copy as any).history).toBeUndefined();
    });

    it('returns null when record does not exist', async () => {
      prisma.copy.findUnique.mockResolvedValue(null);

      const resultId = await service.getCopy(999);
      expect(resultId).toBeNull();

      const resultBarcode = await service.getCopyByBarcode('NON-EXISTENT');
      expect(resultBarcode).toBeNull();
    });
  });

  describe('copyCountsForBook (Staff-only status breakdown)', () => {
    it('returns counts by status for a book', async () => {
      prisma.copy.groupBy.mockResolvedValue([
        { status: CopyStatus.AVAILABLE, _count: { _all: 3 } },
        { status: CopyStatus.ON_HOLD, _count: { _all: 1 } },
        { status: CopyStatus.BORROWED, _count: { _all: 2 } },
        { status: CopyStatus.LOST, _count: { _all: 1 } },
      ]);

      const counts = await service.copyCountsForBook(42);

      expect(counts).toEqual({
        total: 7,
        available: 3,
        onHold: 1,
        borrowed: 2,
        lost: 1,
        damaged: 0,
      });
    });
  });
});
