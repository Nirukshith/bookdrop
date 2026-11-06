import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JobRunnerService } from '../circulation/jobs/job-runner.service';
import { JobRunResult } from '../circulation/jobs/job.types';

export function parseJobArg(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--job=')) {
      return arg.split('=')[1].trim();
    }
    if (arg === '--job' && i + 1 < argv.length) {
      return argv[i + 1].trim();
    }
  }
  return 'all';
}

export async function runJobsCli(jobTarget?: string): Promise<JobRunResult[]> {
  const target = jobTarget ?? parseJobArg(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const results: JobRunResult[] = [];

  try {
    const jobRunner = app.get(JobRunnerService);
    const registeredJobs = jobRunner.getAllJobs();

    if (registeredJobs.length === 0) {
      console.log('ℹ️  No background jobs are currently registered.');
      return [];
    }

    const jobsToRun =
      target === 'all'
        ? registeredJobs
        : registeredJobs.filter((j) => j.name === target);

    if (target !== 'all' && jobsToRun.length === 0) {
      console.error(
        `❌ Error: Job "${target}" not found. Available jobs: ${registeredJobs.map((j) => j.name).join(', ')}`,
      );
      process.exitCode = 1;
      return [];
    }

    console.log(
      `🚀 Running scheduled job(s): ${jobsToRun.map((j) => j.name).join(', ')}`,
    );

    for (const job of jobsToRun) {
      console.log(`\n▶️  Executing job "${job.name}"...`);
      const result = await jobRunner.runOnce(job.name);
      results.push(result);

      if (result.skipped) {
        console.log(
          `⏭️  Job "${job.name}" was SKIPPED (lease is currently held by another runner).`,
        );
      } else if (result.status === 'COMPLETED') {
        console.log(
          `✅ Job "${job.name}" COMPLETED in ${result.durationMs}ms:`,
          result.stats,
        );
      } else {
        console.error(
          `❌ Job "${job.name}" FAILED in ${result.durationMs}ms: ${result.error}`,
        );
      }
    }

    // Print final summary
    console.log('\n=================== JOB SUMMARY ===================');
    console.table(
      results.map((r) => ({
        Job: r.jobName,
        Status: r.status,
        DurationMs: r.durationMs,
        Processed: r.stats?.processed ?? 0,
        Failed: r.stats?.failed ?? 0,
        Events: r.stats?.eventsEmitted ?? 0,
      })),
    );
    console.log('===================================================');

    const hasFailures = results.some((r) => r.status === 'FAILED');
    if (hasFailures) {
      process.exitCode = 1;
    }

    return results;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runJobsCli()
    .then(() => {
      process.exit(process.exitCode ?? 0);
    })
    .catch((err) => {
      console.error('Fatal CLI execution error:', err);
      process.exit(1);
    });
}
