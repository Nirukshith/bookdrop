import { Test, TestingModule } from '@nestjs/testing';
import { JobRunnerService } from './job-runner.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock';
import { Job } from './job.types';

describe('JobRunnerService (Database Integration Tests)', () => {
  let runnerA: JobRunnerService;
  let runnerB: JobRunnerService;
  let prisma: PrismaService;
  const testJobName = 'integration-test-job';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobRunnerService, PrismaService, ClockService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    runnerA = module.get<JobRunnerService>(JobRunnerService);

    // Create a second runner instance to simulate competing node
    runnerB = new JobRunnerService(
      prisma,
      module.get<ClockService>(ClockService),
    );
  });

  beforeEach(async () => {
    // Clean up lease row for testJobName
    await prisma.jobLease.deleteMany({
      where: { name: testJobName },
    });
  });

  afterAll(async () => {
    await prisma.jobLease.deleteMany({
      where: { name: testJobName },
    });
    await prisma.$disconnect();
  });

  it('guarantees mutual exclusion: only one runner can acquire the active lease', async () => {
    let runnerAExecuted = false;
    let runnerBExecuted = false;

    const jobA: Job = {
      name: testJobName,
      intervalSeconds: 60,
      run: async () => {
        runnerAExecuted = true;
        // While runner A is running, runner B attempts to run the exact same job
        const resultB = await runnerB.runOnce(testJobName, {
          runnerId: 'runner-node-b',
        });
        expect(resultB.skipped).toBe(true);
        expect(resultB.status).toBe('SKIPPED');
        return { processed: 1, failed: 0, eventsEmitted: 0 };
      },
    };

    const jobB: Job = {
      name: testJobName,
      intervalSeconds: 60,
      run: async () => {
        runnerBExecuted = true;
        return { processed: 1, failed: 0, eventsEmitted: 0 };
      },
    };

    runnerA.registerJob(jobA);
    runnerB.registerJob(jobB);

    const resultA = await runnerA.runOnce(testJobName, {
      leaseSeconds: 30,
      runnerId: 'runner-node-a',
    });

    expect(resultA.status).toBe('COMPLETED');
    expect(resultA.skipped).toBe(false);
    expect(runnerAExecuted).toBe(true);
    expect(runnerBExecuted).toBe(false);

    // Verify lease is released after completion
    const lease = await prisma.jobLease.findUnique({
      where: { name: testJobName },
    });
    expect(lease?.lockedUntil).toBeNull();
    expect(lease?.lockedBy).toBeNull();
    expect(lease?.lastStatus).toBe('COMPLETED');
  });

  it('allows lease takeover after the lease expires', async () => {
    let runnerBExecuted = false;

    const job: Job = {
      name: testJobName,
      intervalSeconds: 60,
      run: async () => {
        runnerBExecuted = true;
        return { processed: 2, failed: 0, eventsEmitted: 1 };
      },
    };
    runnerB.registerJob(job);

    // Pre-insert an expired lease (locked by a dead runner in the past)
    await prisma.jobLease.upsert({
      where: { name: testJobName },
      create: {
        name: testJobName,
        lockedBy: 'crashed-runner',
        lockedUntil: new Date(Date.now() - 5000), // 5 seconds in past
        lastStartedAt: new Date(Date.now() - 10000),
        lastStatus: 'RUNNING',
      },
      update: {
        lockedBy: 'crashed-runner',
        lockedUntil: new Date(Date.now() - 5000),
        lastStartedAt: new Date(Date.now() - 10000),
        lastStatus: 'RUNNING',
      },
    });

    // Runner B should take over successfully
    const result = await runnerB.runOnce(testJobName, {
      runnerId: 'runner-node-b',
    });

    expect(result.skipped).toBe(false);
    expect(result.status).toBe('COMPLETED');
    expect(runnerBExecuted).toBe(true);

    const finalLease = await prisma.jobLease.findUnique({
      where: { name: testJobName },
    });
    expect(finalLease?.lockedUntil).toBeNull();
    expect(finalLease?.lastStatus).toBe('COMPLETED');
  });
});
