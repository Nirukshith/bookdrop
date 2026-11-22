import { Test, TestingModule } from '@nestjs/testing';
import { BookModel } from '../../books';
import { BookCopiesResolver } from './book-copies.resolver';
import { CopiesDataLoader } from './copies.loader';
import { CopiesService } from './copies.service';

describe('BookCopiesResolver', () => {
  let resolver: BookCopiesResolver;
  let loaderMock: any;
  let serviceMock: any;

  const mockBook: BookModel = {
    id: 42,
    title: 'Dune',
    isbn: '978-0441172719',
    authors: [],
    categories: [],
    availableCopiesCount: 0,
    availableCopies: 0,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    loaderMock = {
      loadAvailableCount: jest.fn(),
    };

    serviceMock = {
      copyCountsForBook: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookCopiesResolver,
        { provide: CopiesDataLoader, useValue: loaderMock },
        { provide: CopiesService, useValue: serviceMock },
      ],
    }).compile();

    resolver = module.get<BookCopiesResolver>(BookCopiesResolver);
  });

  it('resolves availableCopies using DataLoader to eliminate N+1 queries', async () => {
    loaderMock.loadAvailableCount.mockResolvedValue(5);

    const count = await resolver.availableCopies(mockBook);

    expect(loaderMock.loadAvailableCount).toHaveBeenCalledWith(42);
    expect(count).toBe(5);
  });

  it('resolves availableCopiesCount alias using DataLoader', async () => {
    loaderMock.loadAvailableCount.mockResolvedValue(5);

    const count = await resolver.availableCopiesCount(mockBook);

    expect(loaderMock.loadAvailableCount).toHaveBeenCalledWith(42);
    expect(count).toBe(5);
  });

  it('resolves staff-only copyCounts using CopiesService', async () => {
    const mockCounts = {
      total: 10,
      available: 5,
      onHold: 2,
      borrowed: 2,
      lost: 1,
      damaged: 0,
    };
    serviceMock.copyCountsForBook.mockResolvedValue(mockCounts);

    const counts = await resolver.copyCounts(mockBook);

    expect(serviceMock.copyCountsForBook).toHaveBeenCalledWith(42);
    expect(counts).toEqual(mockCounts);
  });
});
