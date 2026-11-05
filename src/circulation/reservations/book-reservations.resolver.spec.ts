import { Test, TestingModule } from '@nestjs/testing';
import { BookReservationsResolver } from './book-reservations.resolver';
import { ReservationsDataLoader } from './reservations.loader';

describe('BookReservationsResolver', () => {
  let resolver: BookReservationsResolver;
  let dataloaderMock: { loadQueueLength: jest.Mock };

  beforeEach(async () => {
    dataloaderMock = {
      loadQueueLength: jest.fn().mockResolvedValue(4),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookReservationsResolver,
        { provide: ReservationsDataLoader, useValue: dataloaderMock },
      ],
    }).compile();

    resolver = module.get<BookReservationsResolver>(BookReservationsResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('resolves queueLength via ReservationsDataLoader without N+1', async () => {
    const book = { id: 10 } as any;

    const result = await resolver.queueLength(book);

    expect(result).toBe(4);
    expect(dataloaderMock.loadQueueLength).toHaveBeenCalledWith(10);
  });
});
