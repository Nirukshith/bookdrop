import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';
import { CopyStatus } from '@prisma/client';

describe('BooksService', () => {
  let service: BooksService;
  let prismaMock: {
    book: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    author: {
      count: jest.Mock;
    };
    category: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      book: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
        copies: [
          { id: 101, status: CopyStatus.AVAILABLE },
          { id: 102, status: CopyStatus.AVAILABLE },
        ],
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
          copies: {
            where: {
              status: CopyStatus.AVAILABLE,
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('1984');
      expect(result[0].availableCopiesCount).toBe(2);
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
    it('returns a book by id with available copies count', async () => {
      const mockBook = {
        id: 1,
        title: '1984',
        isbn: '978-0451524935',
        description: 'Dystopian novel',
        publishedYear: 1949,
        createdAt: new Date(),
        authors: [{ id: 1, name: 'George Orwell' }],
        categories: [{ id: 1, name: 'Dystopian' }],
        copies: [{ id: 101, status: CopyStatus.AVAILABLE }],
      };

      prismaMock.book.findUnique.mockResolvedValue(mockBook);

      const result = await service.findById(1);

      expect(prismaMock.book.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          authors: true,
          categories: true,
          copies: {
            where: {
              status: CopyStatus.AVAILABLE,
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result?.title).toBe('1984');
      expect(result?.availableCopiesCount).toBe(1);
    });

    it('returns null if book is not found', async () => {
      prismaMock.book.findUnique.mockResolvedValue(null);

      const result = await service.findById(999);
      expect(result).toBeNull();
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
        copies: [],
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
  });

  describe('update', () => {
    it('updates a book successfully using set for relations', async () => {
      prismaMock.book.findUnique
        .mockResolvedValueOnce({ id: 1, isbn: '978-0451524935' }) // existing book check
        .mockResolvedValueOnce(null); // duplicate isbn check

      prismaMock.author.count.mockResolvedValue(2);
      prismaMock.category.count.mockResolvedValue(1);

      const mockUpdated = {
        id: 1,
        title: 'Updated 1984',
        isbn: '978-0451524939',
        description: 'Updated description',
        publishedYear: 1950,
        createdAt: new Date(),
        authors: [
          { id: 1, name: 'George Orwell' },
          { id: 2, name: 'Co-Author' },
        ],
        categories: [{ id: 1, name: 'Dystopian' }],
        copies: [{ id: 101, status: CopyStatus.AVAILABLE }],
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
      expect(result.availableCopiesCount).toBe(1);
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

    it('throws NotFoundException when updating non-existent book', async () => {
      prismaMock.book.findUnique.mockResolvedValue(null);

      await expect(
        service.update(999, { title: 'Non existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
