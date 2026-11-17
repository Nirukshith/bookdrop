import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HoldsService } from '../circulation/holds/holds.service';
import { JobRunnerService } from '../circulation/jobs/job-runner.service';

export async function runExpireDueHolds(batchSize = 100) {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const jobRunner = app.get(JobRunnerService, { strict: false });
    if (jobRunner && jobRunner.getJob('expire-holds')) {
      console.log('🔄 Checking for due holds to expire via JobRunner...');
      const result = await jobRunner.runOnce('expire-holds', { batchSize });
      console.log(
        `✅ Holds expiration complete. Status: ${result.status}, Stats: ${JSON.stringify(result.stats)}`,
      );
      return result;
    }

    const holdsService = app.get(HoldsService);
    console.log('🔄 Checking for due holds to expire...');
    const result = await holdsService.expireDueHolds(batchSize);
    console.log(
      `✅ Holds expiration complete. Total candidates: ${result.totalCandidates}, Processed: ${result.processed}, Errors: ${result.errors}`,
    );
    return result;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runExpireDueHolds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Failed to expire due holds:', err);
      process.exit(1);
    });
}
