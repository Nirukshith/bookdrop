import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import {
  JOB_BATCH_SIZE,
  JOB_MAX_RUN_SECONDS,
  LEASE_SECONDS,
} from '../../config/library-rules';
import { Job, JobContext, JobRunResult, JobStats } from './job.types';

export interface RunOnceOptions {
  leaseSeconds?: number;
  maxRunSeconds?: number;
  batchSize?: number;
  runnerId?: string;
}

@Injectable()
export class JobRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(JobRunnerService.name);
  private readonly jobs = new Map<string, Job>();
  private readonly activeSigtermCleanups = new Set<() => void>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Registers a job implementation with the runner.
   */
  registerJob(job: Job): void {
    if (this.jobs.has(job.name)) {
      this.logger.warn(
        `Job with name "${job.name}" is already registered. Overwriting.`,
      );
    }
    this.jobs.set(job.name, job);
    this.logger.log(`Registered job: "${job.name}"`);
  }

  getJob(name: string): Job | undefined {
    return this.jobs.get(name);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Executes a single scheduled or on-demand run of a registered job.
   *
   * Flow:
   * 1. Creates row in "JobLease" if missing.
   * 2. Atomically acquires lease if unlocked or expired. If locked by another worker, returns { skipped: true }.
   * 3. Runs the job with lease renewal callbacks, time budget tracking, and SIGTERM interception.
   * 4. Updates "JobLease" with execution statistics and releases the lease in a finally block.
   */
  async runOnce(name: string, options?: RunOnceOptions): Promise<JobRunResult> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" is not registered in JobRunnerService`);
    }

    const leaseSeconds = options?.leaseSeconds ?? LEASE_SECONDS;
    const maxRunSeconds = options?.maxRunSeconds ?? JOB_MAX_RUN_SECONDS;
    const batchSize = options?.batchSize ?? JOB_BATCH_SIZE;
    const runnerId =
      options?.runnerId ?? `${process.pid}-${randomUUID().slice(0, 8)}`;

    // 1. Ensure lease row exists
    await this.prisma.$executeRaw`
      INSERT INTO "JobLease" ("name")
      VALUES (${name})
      ON CONFLICT ("name") DO NOTHING
    `;

    // 2. Conditionally acquire lease in a single atomic SQL statement
    const acquiredCount = await this.prisma.$executeRaw`
      UPDATE "JobLease"
      SET "lockedUntil" = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
          "lockedBy" = ${runnerId},
          "lastStartedAt" = NOW(),
          "lastStatus" = 'RUNNING',
          "lastError" = NULL
      WHERE "name" = ${name}
        AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
    `;

    if (acquiredCount === 0) {
      this.logger.debug(
        `Lease for job "${name}" is currently held by another worker. Skipping.`,
      );
      return {
        jobName: name,
        skipped: true,
        status: 'SKIPPED',
        durationMs: 0,
      };
    }

    // 3. Lease acquired - set up time budget and graceful shutdown listeners
    const startTime = Date.now();
    const budgetMs = maxRunSeconds * 1000;
    let aborted = false;

    const onSigterm = () => {
      this.logger.warn(
        `SIGTERM received: aborting job "${name}" after current item/batch`,
      );
      aborted = true;
    };

    process.once('SIGTERM', onSigterm);
    const cleanupSigterm = () => {
      process.removeListener('SIGTERM', onSigterm);
      this.activeSigtermCleanups.delete(cleanupSigterm);
    };
    this.activeSigtermCleanups.add(cleanupSigterm);

    const renewLease = async (): Promise<void> => {
      await this.prisma.$executeRaw`
        UPDATE "JobLease"
        SET "lockedUntil" = NOW() + (${leaseSeconds} * INTERVAL '1 second')
        WHERE "name" = ${name} AND "lockedBy" = ${runnerId}
      `;
    };

    const context: JobContext = {
      clock: this.clock,
      batchSize,
      maxRunSeconds,
      renewLease,
      isAborted: () => aborted || Date.now() - startTime >= budgetMs,
      timeRemainingMs: () => Math.max(0, budgetMs - (Date.now() - startTime)),
    };

    let stats: JobStats = { processed: 0, failed: 0, eventsEmitted: 0 };
    let status: 'COMPLETED' | 'FAILED' = 'COMPLETED';
    let errorMessage: string | null = null;

    try {
      this.logger.log(`Job "${name}" started by runner "${runnerId}"`);
      stats = await job.run(context);
      return {
        jobName: name,
        skipped: false,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
        stats,
      };
    } catch (err: any) {
      status = 'FAILED';
      errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Job "${name}" failed: ${errorMessage}`,
        err instanceof Error ? err.stack : undefined,
      );
      return {
        jobName: name,
        skipped: false,
        status: 'FAILED',
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    } finally {
      cleanupSigterm();
      await this.releaseLease(name, runnerId, status, errorMessage, stats);
      this.logger.log(
        `Job "${name}" finished with status=${status} in ${Date.now() - startTime}ms`,
      );
    }
  }

  private async releaseLease(
    name: string,
    runnerId: string,
    status: 'COMPLETED' | 'FAILED',
    errorMessage: string | null,
    stats: JobStats | null,
  ): Promise<void> {
    try {
      const statsJson = stats ? JSON.stringify(stats) : null;
      await this.prisma.$executeRaw`
        UPDATE "JobLease"
        SET "lockedUntil" = NULL,
            "lockedBy" = NULL,
            "lastFinishedAt" = NOW(),
            "lastStatus" = ${status},
            "lastError" = ${errorMessage},
            "lastStats" = ${statsJson}::jsonb
        WHERE "name" = ${name} AND "lockedBy" = ${runnerId}
      `;
    } catch (releaseErr) {
      this.logger.error(
        `Failed to release lease for job "${name}" (runnerId=${runnerId})`,
        releaseErr,
      );
    }
  }

  onModuleDestroy(): void {
    for (const cleanup of this.activeSigtermCleanups) {
      cleanup();
    }
    this.activeSigtermCleanups.clear();
  }
}
