import { Test, TestingModule } from '@nestjs/testing';
import { ExpireHoldsJob } from './expire-holds.job';
import { PrismaService } from '../../../prisma/prisma.service';
import { HoldsService } from '../../holds/holds.service';
import { FakeClockService } from '../../../common/clock';
import { JobContext } from '../job.types';

describe('ExpireHoldsJob (Unit Tests)', () => {
  let job: ExpireHoldsJob;
  let prismaMock: any;
  let holdsServiceMock: any;
  let fakeClock: FakeClockService;

  const now = new Date('2026-11-06T12:00:00.000Z');

  beforeEach(async () => {
    fakeClock = new FakeClockService(now);

    prismaMock = {
      $queryRaw: jest.fn(),
    };

    holdsServiceMock = {
      expireHold: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpireHoldsJob,
        { provide: PrismaService, useValue: prismaMock },
        { provide: HoldsService, useValue: holdsServiceMock },
      ],
    }).compile();

    job = module.get<ExpireHoldsJob>(ExpireHoldsJob);
  });

  it('has correct name and 60-second interval', () => {
    expect(job.name).toBe('expire-holds');
    expect(job.intervalSeconds).toBe(60);
  });

  it('processes candidate expired holds, renews lease, and returns stats', async () => {
    // 1st batch returns 2 holds, 2nd batch returns 0 holds (break)
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ id: 101 }, { id: 102 }])
      .mockResolvedValueOnce([]);

    holdsServiceMock.expireHold
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 });

    const renewLeaseMock = jest.fn().mockResolvedValue(undefined);
    const context: JobContext = {
      clock: fakeClock as any,
      batchSize: 100,
      maxRunSeconds: 50,
      renewLease: renewLeaseMock,
      isAborted: () => false,
      timeRemainingMs: () => 50000,
    };

    const stats = await job.run(context);

    expect(stats.processed).toBe(2);
    expect(stats.failed).toBe(0);
    expect(stats.batches).toBe(1);
    expect(renewLeaseMock).toHaveBeenCalledTimes(2);
    expect(holdsServiceMock.expireHold).toHaveBeenCalledWith(101);
    expect(holdsServiceMock.expireHold).toHaveBeenCalledWith(102);
  });

  it('isolates failures: an individual failure increments failed count without breaking the batch', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ id: 201 }, { id: 202 }])
      .mockResolvedValueOnce([]);

    holdsServiceMock.expireHold
      .mockRejectedValueOnce(new Error('Deadlock or lock contention'))
      .mockResolvedValueOnce({ id: 202 });

    const context: JobContext = {
      clock: fakeClock as any,
      batchSize: 100,
      maxRunSeconds: 50,
      renewLease: jest.fn().mockResolvedValue(undefined),
      isAborted: () => false,
      timeRemainingMs: () => 50000,
    };

    const stats = await job.run(context);

    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(holdsServiceMock.expireHold).toHaveBeenCalledWith(201);
    expect(holdsServiceMock.expireHold).toHaveBeenCalledWith(202);
  });
});

