import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JobsScheduler } from './jobs.scheduler';
import { JobRunnerService } from './job-runner.service';
import { Job } from './job.types';

describe('JobsScheduler (Unit Tests)', () => {
  let scheduler: JobsScheduler;
  let configServiceMock: any;
  let jobRunnerMock: any;
  let schedulerRegistryMock: any;

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn(),
    };

    jobRunnerMock = {
      getAllJobs: jest.fn(),
      runOnce: jest.fn().mockResolvedValue({
        jobName: 'test-job',
        skipped: false,
        status: 'COMPLETED',
        durationMs: 10,
      }),
    };

    schedulerRegistryMock = {
      doesExist: jest.fn().mockReturnValue(false),
      addInterval: jest.fn(),
      deleteInterval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsScheduler,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: JobRunnerService, useValue: jobRunnerMock },
        { provide: SchedulerRegistry, useValue: schedulerRegistryMock },
      ],
    }).compile();

    scheduler = module.get<JobsScheduler>(JobsScheduler);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
  });

  it('does NOT schedule any intervals when SCHEDULER_ENABLED is false (default)', () => {
    configServiceMock.get.mockReturnValue(false);
    jobRunnerMock.getAllJobs.mockReturnValue([
      { name: 'job-1', intervalSeconds: 60, run: jest.fn() },
    ]);

    scheduler.onModuleInit();

    expect(schedulerRegistryMock.addInterval).not.toHaveBeenCalled();
  });

  it('schedules intervals for all registered jobs when SCHEDULER_ENABLED is true', () => {
    configServiceMock.get.mockReturnValue(true);
    const jobs: Job[] = [
      { name: 'expire-holds', intervalSeconds: 60, run: jest.fn() },
      { name: 'reminders', intervalSeconds: 900, run: jest.fn() },
    ];
    jobRunnerMock.getAllJobs.mockReturnValue(jobs);

    scheduler.onModuleInit();

    expect(schedulerRegistryMock.addInterval).toHaveBeenCalledTimes(2);
    expect(schedulerRegistryMock.addInterval).toHaveBeenCalledWith(
      'job:expire-holds',
      expect.anything(),
    );
    expect(schedulerRegistryMock.addInterval).toHaveBeenCalledWith(
      'job:reminders',
      expect.anything(),
    );
  });

  it('skips tick when previous tick of same job is still running in process', async () => {
    let resolveFirstRun: () => void = () => {};
    const firstRunPromise = new Promise<void>((resolve) => {
      resolveFirstRun = resolve;
    });

    jobRunnerMock.runOnce.mockImplementation(async () => {
      await firstRunPromise;
      return {
        jobName: 'slow-job',
        skipped: false,
        status: 'COMPLETED',
        durationMs: 100,
      };
    });

    // Start tick 1 (which stays unresolved)
    const tick1 = scheduler.executeJobTick('slow-job');

    // While tick 1 is running, attempt tick 2
    expect(scheduler.isJobRunningInProcess('slow-job')).toBe(true);
    await scheduler.executeJobTick('slow-job');

    // jobRunner.runOnce should only have been called once because tick 2 skipped!
    expect(jobRunnerMock.runOnce).toHaveBeenCalledTimes(1);

    // Resolve tick 1
    resolveFirstRun();
    await tick1;

    expect(scheduler.isJobRunningInProcess('slow-job')).toBe(false);
  });
});
