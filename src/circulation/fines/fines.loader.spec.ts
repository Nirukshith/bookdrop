import { Test, TestingModule } from '@nestjs/testing';
import { FinesDataLoader } from './fines.loader';
import { PrismaService } from '../../prisma/prisma.service';
import { BooksService } from '../../books';

describe('FinesDataLoader', () => {
  let loader: FinesDataLoader;
  let prismaMock: {
    loan: {
      findMany: jest.Mock;
    };
  };
  let booksServiceMock: {
    findTitlesByIds: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      loan: {
        findMany: jest.fn(),
      },
    };

    booksServiceMock = {
      findTitlesByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinesDataLoader,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: BooksService,
          useValue: booksServiceMock,
        },
      ],
    }).compile();

    loader = await module.resolve<FinesDataLoader>(FinesDataLoader);
  });

  it('is defined', () => {
    expect(loader).toBeDefined();
  });

  it('returns null immediately when loanId is null or undefined without querying database', async () => {
    const title1 = await loader.loadBookTitleForLoan(null);
    const title2 = await loader.loadBookTitleForLoan(undefined);

    expect(title1).toBeNull();
    expect(title2).toBeNull();
    expect(prismaMock.loan.findMany).not.toHaveBeenCalled();
    expect(booksServiceMock.findTitlesByIds).not.toHaveBeenCalled();
  });

  it('batches multiple loan title lookups into a single loan query and single catalog query', async () => {
    prismaMock.loan.findMany.mockResolvedValueOnce([
      { id: 10, bookId: 101 },
      { id: 20, bookId: 102 },
      { id: 30, bookId: 101 }, // same book
    ]);

    const titleMap = new Map<number, string>([
      [101, 'Clean Architecture'],
      [102, 'Designing Data-Intensive Applications'],
    ]);
    booksServiceMock.findTitlesByIds.mockResolvedValueOnce(titleMap);

    const [t1, t2, t3] = await Promise.all([
      loader.loadBookTitleForLoan(10),
      loader.loadBookTitleForLoan(20),
      loader.loadBookTitleForLoan(30),
    ]);

    expect(t1).toBe('Clean Architecture');
    expect(t2).toBe('Designing Data-Intensive Applications');
    expect(t3).toBe('Clean Architecture');

    expect(prismaMock.loan.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 20, 30] } },
      select: { id: true, bookId: true },
    });

    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledTimes(1);
    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledWith([101, 102]);
  });

  it('returns null if loan is not found or book is not found in catalog', async () => {
    prismaMock.loan.findMany.mockResolvedValueOnce([{ id: 99, bookId: 999 }]);
    booksServiceMock.findTitlesByIds.mockResolvedValueOnce(new Map());

    const [titleFound, titleNotFound] = await Promise.all([
      loader.loadBookTitleForLoan(99),
      loader.loadBookTitleForLoan(88), // not returned in prisma query
    ]);

    expect(titleFound).toBeNull();
    expect(titleNotFound).toBeNull();
  });
});
