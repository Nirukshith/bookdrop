import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobsResolver } from './jobs.resolver';
import { JobRunnerService } from './job-runner.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService, FakeClockService } from '../../common/clock';

describe('JobsResolver (Unit Tests)', () => {
  let resolver: JobsResolver;
  let prismaMock: any;
  let jobRunnerMock: any;
  let fakeClock: FakeClockService;

  const now = new Date('2026-11-06T12:00:00.000Z');

  beforeEach(async () => {
    fakeClock = new FakeClockService(now);

    prismaMock = {
      jobLease: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'expire-holds',
            lockedUntil: new Date('2026-11-06T12:02:00.000Z'), // actively leased
            lockedBy: 'worker-1',
            lastStartedAt: now,
            lastFinishedAt: null,
            lastStatus: 'RUNNING',
            lastError: null,
            lastStats: { processed: 5 },
          },
        ]),
      },
    };

    jobRunnerMock = {
      getAllJobs: jest.fn().mockReturnValue([
        { name: 'expire-holds', intervalSeconds: 60, run: jest.fn() },
        { name: 'send-reminders', intervalSeconds: 900, run: jest.fn() },
        { name: 'reminders', intervalSeconds: 900, run: jest.fn() }, // alias
      ]),
      getJob: jest.fn(),
      runOnce: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsResolver,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: fakeClock },
        { provide: JobRunnerService, useValue: jobRunnerMock },
      ],
    }).compile();

    resolver = module.get<JobsResolver>(JobsResolver);
  });

  describe('jobStatuses', () => {
    it('returns statuses for distinct registered jobs and computes isLeased correctly', async () => {
      const statuses = await resolver.jobStatuses();

      // Should exclude 'reminders' alias and return 'expire-holds' and 'send-reminders'
      expect(statuses).toHaveLength(2);

      const expireHoldsStatus = statuses.find((s) => s.name === 'expire-holds');
      expect(expireHoldsStatus).toBeDefined();
      expect(expireHoldsStatus?.isLeased).toBe(true);
      expect(expireHoldsStatus?.lockedBy).toBe('worker-1');
      expect(expireHoldsStatus?.lastStats).toBe(
        JSON.stringify({ processed: 5 }),
      );

      const remindersStatus = statuses.find((s) => s.name === 'send-reminders');
      expect(remindersStatus).toBeDefined();
      expect(remindersStatus?.isLeased).toBe(false);
      expect(remindersStatus?.lastStatus).toBeNull();
    });
  });

  describe('runJob', () => {
    it('runs registered job through JobRunnerService', async () => {
      jobRunnerMock.getJob.mockReturnValue({ name: 'expire-holds' });
      jobRunnerMock.runOnce.mockResolvedValue({
        jobName: 'expire-holds',
        skipped: false,
        status: 'COMPLETED',
        durationMs: 25,
        stats: { processed: 2, failed: 0, eventsEmitted: 4 },
      });

      const result = await resolver.runJob('expire-holds');

      expect(result.jobName).toBe('expire-holds');
      expect(result.status).toBe('COMPLETED');
      expect(result.durationMs).toBe(25);
      expect(result.stats).toBe(
        JSON.stringify({ processed: 2, failed: 0, eventsEmitted: 4 }),
      );
      expect(jobRunnerMock.runOnce).toHaveBeenCalledWith('expire-holds');
    });

    it('throws NotFoundException when job is not registered', async () => {
      jobRunnerMock.getJob.mockReturnValue(undefined);

      await expect(resolver.runJob('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

