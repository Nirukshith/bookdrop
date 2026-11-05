import { Test, TestingModule } from '@nestjs/testing';
import { BooksResolver } from './books.resolver';
import { BooksService } from './books.service';
import { BookModel } from './models/book.model';
import { AuthenticatedUser } from '../auth';
import { Role } from '@prisma/client';

describe('BooksResolver', () => {
  let resolver: BooksResolver;
  let booksServiceMock: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    sub: 42,
    email: 'librarian@bookdrop.test',
    role: Role.LIBRARIAN,
  };

  beforeEach(async () => {
    booksServiceMock = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksResolver,
        {
          provide: BooksService,
          useValue: booksServiceMock,
        },
      ],
    }).compile();

    resolver = module.get<BooksResolver>(BooksResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('createBook', () => {
    it('calls booksService.create with input and user sub as actorId', async () => {
      const input = {
        title: 'New Book',
        isbn: '978-0123456789',
        priceRs: 350.0,
        authorIds: [1],
        categoryIds: [1],
      };
      const expectedResult = { id: 1, ...input } as unknown as BookModel;
      booksServiceMock.create.mockResolvedValue(expectedResult);

      const result = await resolver.createBook(input, mockUser);
      expect(result).toBe(expectedResult);
      expect(booksServiceMock.create).toHaveBeenCalledWith(input, 42);
    });

    it('passes null as actorId when user is not present', async () => {
      const input = {
        title: 'New Book',
        isbn: '978-0123456789',
        authorIds: [1],
        categoryIds: [1],
      };
      booksServiceMock.create.mockResolvedValue({ id: 1 } as BookModel);

      await resolver.createBook(input, undefined);
      expect(booksServiceMock.create).toHaveBeenCalledWith(input, null);
    });
  });

  describe('updateBook', () => {
    it('calls booksService.update with id, input, and actorId', async () => {
      const input = {
        title: 'Updated Book',
        priceRs: 500.0,
      };
      booksServiceMock.update.mockResolvedValue({ id: 1 } as BookModel);

      await resolver.updateBook(1, input, mockUser);
      expect(booksServiceMock.update).toHaveBeenCalledWith(1, input, 42);
    });
  });

  describe('replacementPriceRs', () => {
    it('returns replacementPriceRs directly if present', () => {
      const book = { replacementPriceRs: 250.5 } as BookModel;
      expect(resolver.replacementPriceRs(book)).toBe(250.5);
    });

    it('computes replacementPriceRs from priceMinor if replacementPriceRs is undefined', () => {
      const book = { priceMinor: 49900 } as BookModel;
      expect(resolver.replacementPriceRs(book)).toBe(499.0);
    });

    it('returns null if neither is present', () => {
      const book = {} as BookModel;
      expect(resolver.replacementPriceRs(book)).toBeNull();
    });
  });
});
