import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JobRunnerService } from './job-runner.service';

@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsScheduler.name);
  private readonly runningJobs = new Set<string>();
  private readonly scheduledIntervalNames: string[] = [];
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jobRunner: JobRunnerService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const isEnabled =
      this.configService.get<boolean>('SCHEDULER_ENABLED') === true;

    if (!isEnabled) {
      this.logger.log(
        'In-process scheduler is disabled (SCHEDULER_ENABLED=false). No timers started.',
      );
      return;
    }

    this.logger.log(
      'In-process scheduler is enabled (SCHEDULER_ENABLED=true). Registering job intervals...',
    );

    const jobs = this.jobRunner.getAllJobs();
    for (const job of jobs) {
      this.scheduleJob(job.name, job.intervalSeconds);
    }
  }

  scheduleJob(jobName: string, intervalSeconds: number): void {
    const intervalMs = intervalSeconds * 1000;
    const intervalName = `job:${jobName}`;

    // Clear existing timer if already registered
    const existingTimer = this.activeTimers.get(intervalName);
    if (existingTimer) {
      clearInterval(existingTimer);
      this.activeTimers.delete(intervalName);
    }

    if (this.schedulerRegistry.doesExist('interval', intervalName)) {
      this.schedulerRegistry.deleteInterval(intervalName);
    }

    const timer = setInterval(() => {
      void this.executeJobTick(jobName);
    }, intervalMs);

    this.activeTimers.set(intervalName, timer);
    this.schedulerRegistry.addInterval(intervalName, timer);
    this.scheduledIntervalNames.push(intervalName);

    this.logger.log(
      `Scheduled job "${jobName}" every ${intervalSeconds}s (interval: ${intervalName})`,
    );
  }

  async executeJobTick(jobName: string): Promise<void> {
    if (this.runningJobs.has(jobName)) {
      this.logger.debug(
        `Skipping tick for job "${jobName}": previous run in this process is still in progress.`,
      );
      return;
    }

    this.runningJobs.add(jobName);
    try {
      await this.jobRunner.runOnce(jobName);
    } catch (err: any) {
      this.logger.error(
        `Unexpected error in scheduled tick for job "${jobName}": ${err.message}`,
        err.stack,
      );
    } finally {
      this.runningJobs.delete(jobName);
    }
  }

  isJobRunningInProcess(jobName: string): boolean {
    return this.runningJobs.has(jobName);
  }

  onModuleDestroy(): void {
    for (const timer of this.activeTimers.values()) {
      clearInterval(timer);
    }
    this.activeTimers.clear();

    for (const intervalName of this.scheduledIntervalNames) {
      try {
        if (this.schedulerRegistry.doesExist('interval', intervalName)) {
          this.schedulerRegistry.deleteInterval(intervalName);
        }
      } catch (err) {
        this.logger.debug(`Failed to delete interval ${intervalName}:`, err);
      }
    }
    this.scheduledIntervalNames.length = 0;
    this.runningJobs.clear();
  }
}
