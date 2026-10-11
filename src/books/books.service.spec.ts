import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BooksService', () => {
  let service: BooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: PrismaService,
          useValue: {
            book: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 1,
                  title: '1984',
                  isbn: '978-0451524935',
                  description: 'Dystopian novel',
                  publishedYear: 1949,
                  createdAt: new Date(),
                  authors: [{ id: 1, name: 'George Orwell' }],
                  categories: [{ id: 1, name: 'Dystopian' }],
                  copies: [
                    { id: 1, status: 'AVAILABLE' },
                    { id: 2, status: 'AVAILABLE' },
                  ],
                },
              ]),
              findUnique: jest.fn().mockResolvedValue({
                id: 1,
                title: '1984',
                isbn: '978-0451524935',
                description: 'Dystopian novel',
                publishedYear: 1949,
                createdAt: new Date(),
                authors: [{ id: 1, name: 'George Orwell' }],
                categories: [{ id: 1, name: 'Dystopian' }],
                copies: [{ id: 1, status: 'AVAILABLE' }],
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return books with available copies count', async () => {
    const books = await service.findAll({ search: '1984', take: 10, skip: 0 });
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('1984');
    expect(books[0].availableCopiesCount).toBe(2);
  });

  it('should return a book by id with available copies count', async () => {
    const book = await service.findById(1);
    expect(book).toBeDefined();
    expect(book?.title).toBe('1984');
    expect(book?.availableCopiesCount).toBe(1);
  });
});
