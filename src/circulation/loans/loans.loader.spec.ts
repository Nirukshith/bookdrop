import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { BooksService } from '../../books';
import { IDENTITY_PUBLIC_API } from '../../users';
import { LoansDataLoader } from './loans.loader';

describe('LoansDataLoader (Step 6)', () => {
  let loader: LoansDataLoader;
  let booksServiceMock: { findTitlesByIds: jest.Mock };
  let identityPublicApiMock: { getMembersByIds: jest.Mock };

  beforeEach(async () => {
    booksServiceMock = {
      findTitlesByIds: jest.fn().mockImplementation(async (ids: number[]) => {
        const map = new Map<number, string>();
        ids.forEach((id) => map.set(id, `Book Title ${id}`));
        return map;
      }),
    };

    identityPublicApiMock = {
      getMembersByIds: jest.fn().mockImplementation(async (ids: number[]) => {
        return ids.map((id) => ({
          id,
          name: `Member Name ${id}`,
          email: `member${id}@example.com`,
          role: Role.MEMBER,
        }));
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansDataLoader,
        { provide: BooksService, useValue: booksServiceMock },
        { provide: IDENTITY_PUBLIC_API, useValue: identityPublicApiMock },
      ],
    }).compile();

    loader = await module.resolve<LoansDataLoader>(LoansDataLoader);
  });

  it('batches multiple loadBookTitle calls into a single database query', async () => {
    const [title1, title2, title3] = await Promise.all([
      loader.loadBookTitle(10),
      loader.loadBookTitle(20),
      loader.loadBookTitle(30),
    ]);

    expect(title1).toBe('Book Title 10');
    expect(title2).toBe('Book Title 20');
    expect(title3).toBe('Book Title 30');

    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledTimes(1);
    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledWith([10, 20, 30]);
  });

  it('batches multiple loadMemberName calls into a single database query', async () => {
    const [name1, name2] = await Promise.all([
      loader.loadMemberName(1),
      loader.loadMemberName(2),
    ]);

    expect(name1).toBe('Member Name 1');
    expect(name2).toBe('Member Name 2');

    expect(identityPublicApiMock.getMembersByIds).toHaveBeenCalledTimes(1);
    expect(identityPublicApiMock.getMembersByIds).toHaveBeenCalledWith([1, 2]);
  });

  it('memoizes (caches) repeated requests for the same ID within the same tick', async () => {
    const [titleA, titleB] = await Promise.all([
      loader.loadBookTitle(10),
      loader.loadBookTitle(10),
    ]);

    expect(titleA).toBe('Book Title 10');
    expect(titleB).toBe('Book Title 10');
    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledTimes(1);
    expect(booksServiceMock.findTitlesByIds).toHaveBeenCalledWith([10]);
  });
});
