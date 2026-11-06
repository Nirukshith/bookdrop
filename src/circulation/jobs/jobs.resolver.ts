import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock';
import { isLeaseActive } from '../../config/library-rules';
import { JobRunnerService } from './job-runner.service';
import { JobRunResultModel, JobStatusModel } from './models/job.model';

@Resolver()
@UseGuards(RolesGuard)
export class JobsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
    private readonly jobRunner: JobRunnerService,
  ) {}

  @Query(() => [JobStatusModel], {
    name: 'jobStatuses',
    description:
      'ADMIN query: Returns the status, lease state, and recent execution details of all registered background jobs.',
  })
  @Roles(Role.ADMIN)
  async jobStatuses(): Promise<JobStatusModel[]> {
    const jobs = this.jobRunner.getAllJobs();
    const distinctJobs = jobs.filter((j) => j.name !== 'reminders');
    const now = this.clockService.now();

    const leases = await this.prisma.jobLease.findMany({
      where: {
        name: { in: distinctJobs.map((j) => j.name) },
      },
    });

    const leaseMap = new Map(leases.map((l) => [l.name, l]));

    return distinctJobs.map((job) => {
      const lease = leaseMap.get(job.name);
      const isLeased = isLeaseActive(lease?.lockedUntil, now);

      return {
        name: job.name,
        lastStartedAt: lease?.lastStartedAt ?? null,
        lastFinishedAt: lease?.lastFinishedAt ?? null,
        lastStatus: lease?.lastStatus ?? null,
        lastError: lease?.lastError ?? null,
        lastStats: lease?.lastStats ? JSON.stringify(lease.lastStats) : null,
        isLeased,
        lockedBy: lease?.lockedBy ?? null,
        lockedUntil: lease?.lockedUntil ?? null,
      };
    });
  }

  @Mutation(() => JobRunResultModel, {
    name: 'runJob',
    description:
      'ADMIN mutation: Manually triggers an immediate run of a registered background job with strict rate limiting.',
  })
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async runJob(@Args('name') name: string): Promise<JobRunResultModel> {
    const job = this.jobRunner.getJob(name);
    if (!job) {
      throw new NotFoundException(
        `JOB_NOT_FOUND: Job "${name}" is not registered`,
      );
    }

    const result = await this.jobRunner.runOnce(name);

    return {
      jobName: result.jobName,
      skipped: result.skipped,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error ?? null,
      stats: result.stats ? JSON.stringify(result.stats) : null,
    };
  }
}
