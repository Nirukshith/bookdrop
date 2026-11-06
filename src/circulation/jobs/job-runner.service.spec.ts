import { Test, TestingModule } from '@nestjs/testing';
import { JobRunnerService } from './job-runner.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService, FakeClockService } from '../../common/clock';
import { Job, JobContext, JobStats } from './job.types';

describe('JobRunnerService (Unit & Integration Tests)', () => {
  let runner: JobRunnerService;
  let prismaMock: any;
  let fakeClock: FakeClockService;

  const now = new Date('2026-11-06T12:00:00.000Z');

  beforeEach(async () => {
    fakeClock = new FakeClockService(now);

    prismaMock = {
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      jobLease: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobRunnerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: fakeClock },
      ],
    }).compile();

    runner = module.get<JobRunnerService>(JobRunnerService);
  });

  describe('Job Registration & Retrieval', () => {
    it('registers and retrieves jobs correctly', () => {
      const dummyJob: Job = {
        name: 'test-job',
        intervalSeconds: 60,
        run: jest.fn().mockResolvedValue({
          processed: 0,
          failed: 0,
          eventsEmitted: 0,
        }),
      };

      runner.registerJob(dummyJob);
      expect(runner.getJob('test-job')).toBe(dummyJob);
      expect(runner.getAllJobs()).toContain(dummyJob);
    });

    it('throws when trying to run an unregistered job', async () => {
      await expect(runner.runOnce('non-existent')).rejects.toThrow(
        /is not registered/,
      );
    });
  });

  describe('Lease Exclusivity (Concurrency Protection)', () => {
    it('skips execution gracefully without error when another runner holds the active lease', async () => {
      const runFn = jest.fn();
      const dummyJob: Job = {
        name: 'contested-job',
        intervalSeconds: 60,
        run: runFn,
      };
      runner.registerJob(dummyJob);

      // 1st raw call (INSERT): succeeds
      // 2nd raw call (UPDATE conditional lease): returns 0 rows updated (lock already held)
      prismaMock.$executeRaw
        .mockResolvedValueOnce(0) // INSERT DO NOTHING
        .mockResolvedValueOnce(0); // UPDATE where lockedUntil < now returned 0

      const result = await runner.runOnce('contested-job');

      expect(result.skipped).toBe(true);
      expect(result.status).toBe('SKIPPED');
      expect(result.durationMs).toBe(0);
      expect(runFn).not.toHaveBeenCalled();
    });

    it('successfully acquires lease when unlocked, runs the job, and releases the lease', async () => {
      const stats: JobStats = {
        processed: 10,
        failed: 0,
        eventsEmitted: 10,
      };
      const runFn = jest.fn().mockResolvedValue(stats);

      const dummyJob: Job = {
        name: 'exclusive-job',
        intervalSeconds: 60,
        run: runFn,
      };
      runner.registerJob(dummyJob);

      // 1st call: INSERT
      // 2nd call: UPDATE acquire lease (1 row updated)
      // 3rd call: UPDATE release lease (1 row updated)
      prismaMock.$executeRaw
        .mockResolvedValueOnce(0) // INSERT
        .mockResolvedValueOnce(1) // UPDATE acquire
        .mockResolvedValueOnce(1); // UPDATE release

      const result = await runner.runOnce('exclusive-job');

      expect(result.skipped).toBe(false);
      expect(result.status).toBe('COMPLETED');
      expect(result.stats).toEqual(stats);
      expect(runFn).toHaveBeenCalledTimes(1);

      // Verify release SQL was called
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(3);
    });
  });

  describe('Lease Renewal', () => {
    it('renews the lease when context.renewLease() is invoked during execution', async () => {
      let capturedContext: JobContext | undefined;
      const dummyJob: Job = {
        name: 'renew-job',
        intervalSeconds: 60,
        run: jest.fn().mockImplementation(async (ctx: JobContext) => {
          capturedContext = ctx;
          await ctx.renewLease();
          return { processed: 1, failed: 0, eventsEmitted: 0 };
        }),
      };
      runner.registerJob(dummyJob);

      prismaMock.$executeRaw
        .mockResolvedValueOnce(0) // INSERT
        .mockResolvedValueOnce(1) // UPDATE acquire
        .mockResolvedValueOnce(1) // UPDATE renew
        .mockResolvedValueOnce(1); // UPDATE release

      const result = await runner.runOnce('renew-job');

      expect(result.status).toBe('COMPLETED');
      expect(capturedContext).toBeDefined();
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(4);
    });
  });

  describe('Time Budget & Graceful Abort', () => {
    it('provides time budget countdown and reports isAborted when budget is exceeded', async () => {
      let remainingMsAtStart = -1;
      let remainingMsAtEnd = -1;
      let wasAborted = false;

      const dummyJob: Job = {
        name: 'budget-job',
        intervalSeconds: 60,
        run: jest.fn().mockImplementation(async (ctx: JobContext) => {
          remainingMsAtStart = ctx.timeRemainingMs();
          // Simulate some elapsed time
          await new Promise((resolve) => setTimeout(resolve, 60));
          remainingMsAtEnd = ctx.timeRemainingMs();
          wasAborted = ctx.isAborted();
          return { processed: 1, failed: 0, eventsEmitted: 0 };
        }),
      };
      runner.registerJob(dummyJob);

      prismaMock.$executeRaw
        .mockResolvedValueOnce(0) // INSERT
        .mockResolvedValueOnce(1) // UPDATE acquire
        .mockResolvedValueOnce(1); // UPDATE release

      // Run with very short 50ms budget
      const result = await runner.runOnce('budget-job', {
        maxRunSeconds: 0.05,
      });

      expect(result.status).toBe('COMPLETED');
      expect(remainingMsAtStart).toBeGreaterThan(0);
      expect(remainingMsAtEnd).toBe(0);
      expect(wasAborted).toBe(true);
    });
  });

  describe('Error Handling & Guaranteed Lease Release', () => {
    it('catches job errors, returns FAILED status, and guarantees lease release with error details', async () => {
      const dummyJob: Job = {
        name: 'failing-job',
        intervalSeconds: 60,
        run: jest.fn().mockRejectedValue(new Error('Simulated crash!')),
      };
      runner.registerJob(dummyJob);

      prismaMock.$executeRaw
        .mockResolvedValueOnce(0) // INSERT
        .mockResolvedValueOnce(1) // UPDATE acquire
        .mockResolvedValueOnce(1); // UPDATE release in finally

      const result = await runner.runOnce('failing-job');

      expect(result.status).toBe('FAILED');
      expect(result.skipped).toBe(false);
      expect(result.error).toBe('Simulated crash!');

      // Lease release was still called in finally!
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(3);
    });
  });

  describe('SIGTERM Handling', () => {
    it('sets isAborted to true when SIGTERM is emitted', async () => {
      let abortedInside = false;

      const dummyJob: Job = {
        name: 'sigterm-job',
        intervalSeconds: 60,
        run: jest.fn().mockImplementation(async (ctx: JobContext) => {
          process.emit('SIGTERM');
          abortedInside = ctx.isAborted();
          return { processed: 0, failed: 0, eventsEmitted: 0 };
        }),
      };
      runner.registerJob(dummyJob);

      prismaMock.$executeRaw
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const result = await runner.runOnce('sigterm-job');
      expect(result.status).toBe('COMPLETED');
      expect(abortedInside).toBe(true);
    });
  });
});
