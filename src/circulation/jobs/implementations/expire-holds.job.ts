import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { HoldsService } from '../../holds/holds.service';
import { EXPIRE_HOLDS_INTERVAL_SECONDS } from '../../../config/library-rules';
import { Job, JobContext, JobStats } from '../job.types';

@Injectable()
export class ExpireHoldsJob implements Job {
  readonly name = 'expire-holds';
  readonly intervalSeconds = EXPIRE_HOLDS_INTERVAL_SECONDS;
  private readonly logger = new Logger(ExpireHoldsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holdsService: HoldsService,
  ) {}

  async run(context: JobContext): Promise<JobStats> {
    const stats: JobStats = {
      processed: 0,
      failed: 0,
      eventsEmitted: 0,
      batches: 0,
    };

    while (context.timeRemainingMs() > 0 && !context.isAborted()) {
      await context.renewLease();
      const now = context.clock.now();

      // Query candidate active holds whose pickup deadline has passed
      const candidates = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Hold"
        WHERE status = 'ACTIVE'
          AND "expiresAt" <= ${now}
        ORDER BY "expiresAt" ASC
        LIMIT ${context.batchSize}
      `;

      if (!candidates || candidates.length === 0) {
        break;
      }

      stats.batches = (stats.batches ?? 0) + 1;

      for (const candidate of candidates) {
        if (context.isAborted() || context.timeRemainingMs() <= 0) {
          this.logger.warn(
            `Time budget exhausted or aborted during hold expiration batch. Stopping early.`,
          );
          break;
        }

        try {
          const expired = await this.holdsService.expireHold(candidate.id);
          if (expired) {
            stats.processed++;
            // Each expired hold emits hold.expired + missed_pickup.recorded (+ potential fine)
            stats.eventsEmitted += 2;
          }
        } catch (err: any) {
          this.logger.error(
            `Failed to expire hold #${candidate.id}: ${err.message}`,
            err.stack,
          );
          stats.failed++;
        }
      }
    }

    return stats;
  }
}

