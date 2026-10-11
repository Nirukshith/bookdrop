import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';
import { CopyStatus } from '@prisma/client';

describe('BooksService', () => {
  let service: BooksService;
  let prismaMock: {
    book: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      book: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
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
});
