import { Test, TestingModule } from '@nestjs/testing';
import { HoldsDataLoader } from './holds.loader';
import { BooksService } from '../../books';

describe('HoldsDataLoader (Cross-Domain Batching & N+1 Prevention)', () => {
  let loader: HoldsDataLoader;
  let booksServiceMock: {
    findTitlesByIds: jest.Mock;
  };

  beforeEach(async () => {
    booksServiceMock = {
      findTitlesByIds: jest.fn().mockImplementation(async (ids: number[]) => {
        const map = new Map<number, string>();
        for (const id of ids) {
          map.set(id, `Book Title #${id}`);
        }
        return map;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoldsDataLoader,
        { provide: BooksService, useValue: booksServiceMock },
      ],
    }).compile();

    loader = await module.resolve<HoldsDataLoader>(HoldsDataLoader);
  });

  it('coalesces multiple simultaneous title loads into a single batched query', async () => {
    const promises = [
      loader.loadBookTitle(1),
      loader.loadBookTitle(2),
      loader.loadBookTitle(3),
    ];

    const titles = await Promise.all(promises);

    expect(titles).toEqual(['Book Title #1', 'Book Title #2', 'Book Title #3']);

    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledTimes(1);
    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('caches results within the same request scope', async () => {
    const title1 = await loader.loadBookTitle(10);
    const title2 = await loader.loadBookTitle(10);

    expect(title1).toBe('Book Title #10');
    expect(title2).toBe('Book Title #10');

    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledTimes(1);
  });

  it('returns "Unknown Title" when book ID is missing from catalog', async () => {
    booksServiceMock.findTitlesByIds.mockResolvedValue(new Map());

    const title = await loader.loadBookTitle(999);
    expect(title).toBe('Unknown Title');
  });
});
