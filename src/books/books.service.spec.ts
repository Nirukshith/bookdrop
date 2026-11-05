import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';
import { DOMAIN_EVENT_NAMES } from '../contracts/events';
import { InvalidPriceError } from './errors/invalid-price.error';

describe('BooksService', () => {
  let service: BooksService;
  let eventEmitterMock: {
    emit: jest.Mock;
  };
  let prismaMock: {
    book: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    author: {
      count: jest.Mock;
    };
    category: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    eventEmitterMock = {
      emit: jest.fn(),
    };

    prismaMock = {
      book: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      author: {
        count: jest.fn(),
      },
      category: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('applies search, author, category filters and pagination arguments', async () => {
      const mockBook = {
        id: 1,
        title: '1984',
        isbn: '978-0451524935',
        description: 'Dystopian novel',
        publishedYear: 1949,
        createdAt: new Date(),
        authors: [{ id: 1, name: 'George Orwell' }],
        categories: [{ id: 1, name: 'Dystopian' }],
      };

      prismaMock.book.findMany.mockResolvedValue([mockBook]);

      const result = await service.findAll({
        search: '1984',
        categoryId: 1,
        authorId: 2,
        take: 5,
        skip: 10,
      });

      expect(prismaMock.book.findMany).toHaveBeenCalledWith({
        where: {
          title: {
            contains: '1984',
            mode: 'insensitive',
          },
          categories: {
            some: { id: 1 },
          },
          authors: {
            some: { id: 2 },
          },
        },
        take: 5,
        skip: 10,
        include: {
          authors: true,
          categories: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('1984');
    });

    it('uses default pagination values when take and skip are not provided', async () => {
      prismaMock.book.findMany.mockResolvedValue([]);

      await service.findAll({});

      expect(prismaMock.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns a book by id', async () => {
      const mockBook = {
        id: 1,
        title: '1984',
        isbn: '978-0451524935',
        description: 'Dystopian novel',
        publishedYear: 1949,
        createdAt: new Date(),
        authors: [{ id: 1, name: 'George Orwell' }],
        categories: [{ id: 1, name: 'Dystopian' }],
      };

      prismaMock.book.findUnique.mockResolvedValue(mockBook);

      const result = await service.findById(1);

      expect(prismaMock.book.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          authors: true,
          categories: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.title).toBe('1984');
    });

    it('returns null if book is not found', async () => {
      prismaMock.book.findUnique.mockResolvedValue(null);

      const result = await service.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('returns true when book count > 0', async () => {
      prismaMock.book.count.mockResolvedValue(1);

      const result = await service.exists(1);
      expect(result).toBe(true);
      expect(prismaMock.book.count).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('returns false when book count is 0', async () => {
      prismaMock.book.count.mockResolvedValue(0);

      const result = await service.exists(999);
      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('creates a new book with connected relations', async () => {
      prismaMock.author.count.mockResolvedValue(1);
      prismaMock.category.count.mockResolvedValue(1);
      prismaMock.book.findUnique.mockResolvedValue(null);

      const mockCreated = {
        id: 10,
        title: 'Brave New World',
        isbn: '978-0060850524',
        description: 'Classic dystopian fiction',
        publishedYear: 1932,
        createdAt: new Date(),
        authors: [{ id: 1, name: 'Aldous Huxley' }],
        categories: [{ id: 1, name: 'Dystopian' }],
      };

      prismaMock.book.create.mockResolvedValue(mockCreated);

      const result = await service.create({
        title: 'Brave New World',
        isbn: '978-0060850524',
        description: 'Classic dystopian fiction',
        publishedYear: 1932,
        authorIds: [1],
        categoryIds: [1],
      });

      expect(result.id).toBe(10);
      expect(result.title).toBe('Brave New World');
      expect(result.availableCopiesCount).toBe(0);
      expect(prismaMock.book.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Brave New World',
            isbn: '978-0060850524',
            authors: { connect: [{ id: 1 }] },
            categories: { connect: [{ id: 1 }] },
          }),
        }),
      );
    });

    it('rejects duplicate ISBN with ConflictException', async () => {
      prismaMock.author.count.mockResolvedValue(1);
      prismaMock.category.count.mockResolvedValue(1);
      prismaMock.book.findUnique.mockResolvedValue({
        id: 1,
        isbn: '978-0451524935',
      });

      await expect(
        service.create({
          title: 'Duplicate ISBN Book',
          isbn: '978-0451524935',
          authorIds: [1],
          categoryIds: [1],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects invalid author IDs with BadRequestException', async () => {
      prismaMock.author.count.mockResolvedValue(0);

      await expect(
        service.create({
          title: 'Unknown Author Book',
          isbn: '978-1111111111',
          authorIds: [999],
          categoryIds: [1],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a book with valid price and emits book.price_changed', async () => {
      prismaMock.author.count.mockResolvedValue(1);
      prismaMock.category.count.mockResolvedValue(1);
      prismaMock.book.findUnique.mockResolvedValue(null);

      const mockCreated = {
        id: 11,
        title: 'Priced Book',
        isbn: '978-0123456789',
        priceMinor: 49900,
        availableCopiesCount: 0,
        availableCopies: 0,
        createdAt: new Date(),
        authors: [{ id: 1, name: 'Author' }],
        categories: [{ id: 1, name: 'Cat' }],
      };

      prismaMock.book.create.mockResolvedValue(mockCreated);

      const result = await service.create(
        {
          title: 'Priced Book',
          isbn: '978-0123456789',
          priceRs: 499.0,
          authorIds: [1],
          categoryIds: [1],
        },
        42,
      );

      expect(result.id).toBe(11);
      expect(result.replacementPriceRs).toBe(499.0);
      expect(prismaMock.book.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceMinor: 49900,
          }),
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.BOOK_PRICE_CHANGED,
        expect.objectContaining({
          bookId: 11,
          oldPriceMinor: null,
          newPriceMinor: 49900,
          actorId: 42,
        }),
      );
    });

    it('rejects invalid price on create with InvalidPriceError', async () => {
      await expect(
        service.create({
          title: 'Invalid Price Book',
          isbn: '978-1111111111',
          priceRs: -10,
          authorIds: [1],
          categoryIds: [1],
        }),
      ).rejects.toThrow(InvalidPriceError);

      await expect(
        service.create({
          title: 'Invalid Price Book',
          isbn: '978-1111111111',
          priceRs: 12.345,
          authorIds: [1],
          categoryIds: [1],
        }),
      ).rejects.toThrow(InvalidPriceError);
    });
  });

  describe('update', () => {
    it('updates a book successfully using set for relations', async () => {
      prismaMock.book.findUnique
        .mockResolvedValueOnce({ id: 1, isbn: '978-0451524935', priceMinor: null }) // existing book check
        .mockResolvedValueOnce(null); // duplicate isbn check

      prismaMock.author.count.mockResolvedValue(2);
      prismaMock.category.count.mockResolvedValue(1);

      const mockUpdated = {
        id: 1,
        title: 'Updated 1984',
        isbn: '978-0451524939',
        description: 'Updated description',
        publishedYear: 1950,
        priceMinor: null,
        createdAt: new Date(),
        authors: [
          { id: 1, name: 'George Orwell' },
          { id: 2, name: 'Co-Author' },
        ],
        categories: [{ id: 1, name: 'Dystopian' }],
      };

      prismaMock.book.update.mockResolvedValue(mockUpdated);

      const result = await service.update(1, {
        title: 'Updated 1984',
        isbn: '978-0451524939',
        authorIds: [1, 2],
        categoryIds: [1],
      });

      expect(result.title).toBe('Updated 1984');
      expect(result.isbn).toBe('978-0451524939');
      expect(prismaMock.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            title: 'Updated 1984',
            isbn: '978-0451524939',
            authors: { set: [{ id: 1 }, { id: 2 }] },
            categories: { set: [{ id: 1 }] },
          }),
        }),
      );
    });

    it('updates book price and emits book.price_changed', async () => {
      prismaMock.book.findUnique
        .mockResolvedValueOnce({ id: 1, isbn: '978-0451524935', priceMinor: 30000 })
        .mockResolvedValueOnce(null);

      const mockUpdated = {
        id: 1,
        title: '1984',
        isbn: '978-0451524935',
        priceMinor: 45000,
        authors: [],
        categories: [],
      };
      prismaMock.book.update.mockResolvedValue(mockUpdated);

      const result = await service.update(1, { priceRs: 450.0 }, 99);

      expect(result.replacementPriceRs).toBe(450.0);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.BOOK_PRICE_CHANGED,
        expect.objectContaining({
          bookId: 1,
          oldPriceMinor: 30000,
          newPriceMinor: 45000,
          actorId: 99,
        }),
      );
    });

    it('does not emit book.price_changed if price was unchanged', async () => {
      prismaMock.book.findUnique
        .mockResolvedValueOnce({ id: 1, isbn: '978-0451524935', priceMinor: 45000 })
        .mockResolvedValueOnce(null);

      const mockUpdated = {
        id: 1,
        title: '1984',
        isbn: '978-0451524935',
        priceMinor: 45000,
        authors: [],
        categories: [],
      };
      prismaMock.book.update.mockResolvedValue(mockUpdated);

      await service.update(1, { priceRs: 450.0 }, 99);

      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('clears book price when priceRs is null and emits event', async () => {
      prismaMock.book.findUnique
        .mockResolvedValueOnce({ id: 1, isbn: '978-0451524935', priceMinor: 45000 })
        .mockResolvedValueOnce(null);

      const mockUpdated = {
        id: 1,
        title: '1984',
        isbn: '978-0451524935',
        priceMinor: null,
        authors: [],
        categories: [],
      };
      prismaMock.book.update.mockResolvedValue(mockUpdated);

      const result = await service.update(1, { priceRs: null }, 99);

      expect(result.replacementPriceRs).toBeNull();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.BOOK_PRICE_CHANGED,
        expect.objectContaining({
          bookId: 1,
          oldPriceMinor: 45000,
          newPriceMinor: null,
          actorId: 99,
        }),
      );
    });

    it('rejects invalid price on update with InvalidPriceError', async () => {
      prismaMock.book.findUnique.mockResolvedValue({
        id: 1,
        isbn: '978-0451524935',
        priceMinor: 10000,
      });

      await expect(
        service.update(1, { priceRs: 0 }),
      ).rejects.toThrow(InvalidPriceError);
    });

    it('throws NotFoundException when updating non-existent book', async () => {
      prismaMock.book.findUnique.mockResolvedValue(null);

      await expect(
        service.update(999, { title: 'Non existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findTitlesByIds', () => {
    it('returns empty Map if given empty array', async () => {
      const result = await service.findTitlesByIds([]);
      expect(result.size).toBe(0);
      expect(prismaMock.book.findMany).not.toHaveBeenCalled();
    });

    it('returns Map of id -> title with batched query using select', async () => {
      prismaMock.book.findMany.mockResolvedValue([
        { id: 1, title: '1984' },
        { id: 2, title: 'Animal Farm' },
      ]);

      const result = await service.findTitlesByIds([1, 2, 1]); // duplicate id deduplicated
      expect(result.size).toBe(2);
      expect(result.get(1)).toBe('1984');
      expect(result.get(2)).toBe('Animal Farm');

      expect(prismaMock.book.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        select: { id: true, title: true },
      });
    });
  });

  describe('getBookPricesMinor', () => {
    it('returns empty Map if given empty array without querying DB', async () => {
      const result = await service.getBookPricesMinor([]);
      expect(result.size).toBe(0);
      expect(prismaMock.book.findMany).not.toHaveBeenCalled();
    });

    it('returns Map of bookId -> priceMinor (or null if unset), deduplicating input', async () => {
      prismaMock.book.findMany.mockResolvedValue([
        { id: 1, priceMinor: 49900 },
        { id: 2, priceMinor: null },
      ]);

      const result = await service.getBookPricesMinor([1, 2, 3, 1]);
      expect(result.size).toBe(3);
      expect(result.get(1)).toBe(49900);
      expect(result.get(2)).toBeNull();
      expect(result.get(3)).toBeNull(); // book 3 not in DB

      expect(prismaMock.book.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] } },
        select: { id: true, priceMinor: true },
      });
    });
  });

  describe('exists', () => {
    it('returns true when book exists', async () => {
      prismaMock.book.count.mockResolvedValue(1);
      const result = await service.exists(1);
      expect(result).toBe(true);
      expect(prismaMock.book.count).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('returns false when book does not exist', async () => {
      prismaMock.book.count.mockResolvedValue(0);
      const result = await service.exists(999);
      expect(result).toBe(false);
    });
  });
});
