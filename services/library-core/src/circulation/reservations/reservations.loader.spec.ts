import { Test, TestingModule } from '@nestjs/testing';
import { ReservationStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BooksService } from '../../books';
import { IDENTITY_PUBLIC_API } from '../../users';
import { ReservationsDataLoader } from './reservations.loader';

describe('ReservationsDataLoader', () => {
  let loader: ReservationsDataLoader;
  let prismaMock: any;
  let booksServiceMock: any;
  let identityPublicApiMock: any;

  beforeEach(async () => {
    prismaMock = {
      reservation: {
        groupBy: jest.fn().mockResolvedValue([
          { bookId: 10, _count: { _all: 3 } },
          { bookId: 20, _count: { _all: 1 } },
        ]),
      },
      book: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 10, title: 'Clean Architecture' }]),
      },
      hold: {
        findMany: jest.fn().mockResolvedValue([{ id: 77, status: 'ACTIVE' }]),
      },
    };

    booksServiceMock = {};

    identityPublicApiMock = {
      getMembersByIds: jest.fn().mockResolvedValue([
        {
          id: 42,
          name: 'Alice',
          email: 'alice@example.com',
          role: Role.MEMBER,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsDataLoader,
        { provide: PrismaService, useValue: prismaMock },
        { provide: BooksService, useValue: booksServiceMock },
        { provide: IDENTITY_PUBLIC_API, useValue: identityPublicApiMock },
      ],
    }).compile();

    loader = await module.resolve<ReservationsDataLoader>(
      ReservationsDataLoader,
    );
  });

  it('should be defined', () => {
    expect(loader).toBeDefined();
  });

  it('batches queueLength loading by bookId', async () => {
    const [len1, len2, len3] = await Promise.all([
      loader.loadQueueLength(10),
      loader.loadQueueLength(20),
      loader.loadQueueLength(30), // No reservations
    ]);

    expect(len1).toBe(3);
    expect(len2).toBe(1);
    expect(len3).toBe(0);

    expect(prismaMock.reservation.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.reservation.groupBy).toHaveBeenCalledWith({
      by: ['bookId'],
      where: {
        bookId: { in: [10, 20, 30] },
        status: ReservationStatus.WAITING,
      },
      _count: { _all: true },
    });
  });

  it('batches book loading by IDs', async () => {
    const [book1, book2] = await Promise.all([
      loader.loadBook(10),
      loader.loadBook(99),
    ]);

    expect(book1).toEqual({ id: 10, title: 'Clean Architecture' });
    expect(book2).toBeNull();
    expect(prismaMock.book.findMany).toHaveBeenCalledTimes(1);
  });

  it('batches user loading by IDs', async () => {
    const [user1, user2] = await Promise.all([
      loader.loadUser(42),
      loader.loadUser(99),
    ]);

    expect(user1).toEqual(expect.objectContaining({ id: 42, name: 'Alice' }));
    expect(user2).toBeNull();
    expect(identityPublicApiMock.getMembersByIds).toHaveBeenCalledTimes(1);
  });

  it('batches hold loading by IDs', async () => {
    const [hold1, hold2] = await Promise.all([
      loader.loadHold(77),
      loader.loadHold(99),
    ]);

    expect(hold1).toEqual({ id: 77, status: 'ACTIVE' });
    expect(hold2).toBeNull();
    expect(prismaMock.hold.findMany).toHaveBeenCalledTimes(1);
  });
});
