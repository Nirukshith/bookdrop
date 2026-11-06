import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { HoldStatus, LoanStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  computeDaysLate,
  DUE_SOON_HOURS,
  HOLD_REMINDER_HOURS,
  REMINDERS_INTERVAL_SECONDS,
} from '../../../config/library-rules';
import { LoanDueSoonEvent, LoanOverdueEvent } from '../../loans/events';
import { HoldExpiringSoonEvent } from '../../holds/events';
import { Job, JobContext, JobStats } from '../job.types';

@Injectable()
export class SendRemindersJob implements Job {
  readonly name = 'send-reminders';
  readonly intervalSeconds = REMINDERS_INTERVAL_SECONDS;
  private readonly logger = new Logger(SendRemindersJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async run(context: JobContext): Promise<JobStats> {
    const stats: JobStats = {
      processed: 0,
      failed: 0,
      eventsEmitted: 0,
      batches: 0,
      dueSoonReminders: 0,
      overdueReminders: 0,
      holdExpiringReminders: 0,
    };

    const libraryTimezone =
      this.configService.get<string>('LIBRARY_TIMEZONE') || 'UTC';

    // Sweep 1: Loans Due Soon (ACTIVE, dueAt > now AND dueAt <= now + 48h)
    await this.sweepDueSoonLoans(context, stats);

    // Sweep 2: Loans Overdue (ACTIVE, dueAt <= now)
    if (!context.isAborted() && context.timeRemainingMs() > 0) {
      await this.sweepOverdueLoans(context, stats, libraryTimezone);
    }

    // Sweep 3: Holds Expiring Soon (ACTIVE, expiresAt > now AND expiresAt <= now + 6h)
    if (!context.isAborted() && context.timeRemainingMs() > 0) {
      await this.sweepExpiringHolds(context, stats);
    }

    return stats;
  }

  private async sweepDueSoonLoans(
    context: JobContext,
    stats: JobStats,
  ): Promise<void> {
    while (context.timeRemainingMs() > 0 && !context.isAborted()) {
      await context.renewLease();
      const now = context.clock.now();
      const dueSoonDeadline = new Date(
        now.getTime() + DUE_SOON_HOURS * 60 * 60 * 1000,
      );

      // Find candidates that do not yet have a ReminderMark of kind LOAN_DUE_SOON
      const candidates = await this.prisma.loan.findMany({
        where: {
          status: LoanStatus.ACTIVE,
          dueAt: {
            gt: now,
            lte: dueSoonDeadline,
          },
        },
        select: {
          id: true,
          userId: true,
          bookId: true,
          dueAt: true,
        },
        orderBy: { dueAt: 'asc' },
        take: context.batchSize,
      });

      if (candidates.length === 0) {
        break;
      }

      stats.batches = (stats.batches ?? 0) + 1;
      let newMarksInBatch = 0;

      for (const loan of candidates) {
        if (context.isAborted() || context.timeRemainingMs() <= 0) {
          break;
        }

        try {
          stats.processed++;
          let emitted = false;

          // Each item processed in its own transaction
          await this.prisma.$transaction(async (tx) => {
            const insertedCount = await tx.$executeRaw`
              INSERT INTO "ReminderMark" ("kind", "userId", "loanId", "createdAt")
              VALUES ('LOAN_DUE_SOON'::"ReminderKind", ${loan.userId}, ${loan.id}, ${now})
              ON CONFLICT ("kind", "loanId") DO NOTHING
            `;

            if (insertedCount === 1) {
              emitted = true;
            }
          });

          // Emission is post-commit (at-most-once delivery)
          if (emitted) {
            this.eventEmitter.emit(
              LoanDueSoonEvent.EVENT_NAME,
              new LoanDueSoonEvent(
                loan.id,
                loan.userId,
                loan.bookId,
                loan.dueAt,
                now,
              ),
            );
            stats.eventsEmitted++;
            stats.dueSoonReminders = (stats.dueSoonReminders ?? 0) + 1;
            newMarksInBatch++;
          }
        } catch (err: any) {
          this.logger.error(
            `Error processing due-soon reminder for loan #${loan.id}: ${err.message}`,
            err.stack,
          );
          stats.failed++;
        }
      }

      // If no new marks were inserted in this entire batch, all candidates are already marked; break
      if (newMarksInBatch === 0 && candidates.length > 0) {
        break;
      }
    }
  }

  private async sweepOverdueLoans(
    context: JobContext,
    stats: JobStats,
    timezone: string,
  ): Promise<void> {
    while (context.timeRemainingMs() > 0 && !context.isAborted()) {
      await context.renewLease();
      const now = context.clock.now();

      const candidates = await this.prisma.loan.findMany({
        where: {
          status: LoanStatus.ACTIVE,
          dueAt: {
            lte: now,
          },
        },
        select: {
          id: true,
          userId: true,
          bookId: true,
          dueAt: true,
        },
        orderBy: { dueAt: 'asc' },
        take: context.batchSize,
      });

      if (candidates.length === 0) {
        break;
      }

      stats.batches = (stats.batches ?? 0) + 1;
      let newMarksInBatch = 0;

      for (const loan of candidates) {
        if (context.isAborted() || context.timeRemainingMs() <= 0) {
          break;
        }

        try {
          stats.processed++;
          let emitted = false;

          await this.prisma.$transaction(async (tx) => {
            const insertedCount = await tx.$executeRaw`
              INSERT INTO "ReminderMark" ("kind", "userId", "loanId", "createdAt")
              VALUES ('LOAN_OVERDUE'::"ReminderKind", ${loan.userId}, ${loan.id}, ${now})
              ON CONFLICT ("kind", "loanId") DO NOTHING
            `;

            if (insertedCount === 1) {
              emitted = true;
            }
          });

          if (emitted) {
            const daysLate = computeDaysLate(loan.dueAt, now, timezone);
            this.eventEmitter.emit(
              LoanOverdueEvent.EVENT_NAME,
              new LoanOverdueEvent(
                loan.id,
                loan.userId,
                loan.bookId,
                loan.dueAt,
                daysLate,
                now,
              ),
            );
            stats.eventsEmitted++;
            stats.overdueReminders = (stats.overdueReminders ?? 0) + 1;
            newMarksInBatch++;
          }
        } catch (err: any) {
          this.logger.error(
            `Error processing overdue reminder for loan #${loan.id}: ${err.message}`,
            err.stack,
          );
          stats.failed++;
        }
      }

      if (newMarksInBatch === 0 && candidates.length > 0) {
        break;
      }
    }
  }

  private async sweepExpiringHolds(
    context: JobContext,
    stats: JobStats,
  ): Promise<void> {
    while (context.timeRemainingMs() > 0 && !context.isAborted()) {
      await context.renewLease();
      const now = context.clock.now();
      const expiringDeadline = new Date(
        now.getTime() + HOLD_REMINDER_HOURS * 60 * 60 * 1000,
      );

      const candidates = await this.prisma.hold.findMany({
        where: {
          status: HoldStatus.ACTIVE,
          expiresAt: {
            gt: now,
            lte: expiringDeadline,
          },
        },
        select: {
          id: true,
          userId: true,
          bookId: true,
          expiresAt: true,
        },
        orderBy: { expiresAt: 'asc' },
        take: context.batchSize,
      });

      if (candidates.length === 0) {
        break;
      }

      stats.batches = (stats.batches ?? 0) + 1;
      let newMarksInBatch = 0;

      for (const hold of candidates) {
        if (context.isAborted() || context.timeRemainingMs() <= 0) {
          break;
        }

        try {
          stats.processed++;
          let emitted = false;

          await this.prisma.$transaction(async (tx) => {
            const insertedCount = await tx.$executeRaw`
              INSERT INTO "ReminderMark" ("kind", "userId", "holdId", "createdAt")
              VALUES ('HOLD_EXPIRING_SOON'::"ReminderKind", ${hold.userId}, ${hold.id}, ${now})
              ON CONFLICT ("kind", "holdId") DO NOTHING
            `;

            if (insertedCount === 1) {
              emitted = true;
            }
          });

          if (emitted) {
            this.eventEmitter.emit(
              HoldExpiringSoonEvent.EVENT_NAME,
              new HoldExpiringSoonEvent(
                hold.id,
                hold.userId,
                hold.bookId,
                hold.expiresAt,
                now,
              ),
            );
            stats.eventsEmitted++;
            stats.holdExpiringReminders =
              (stats.holdExpiringReminders ?? 0) + 1;
            newMarksInBatch++;
          }
        } catch (err: any) {
          this.logger.error(
            `Error processing expiring hold reminder for hold #${hold.id}: ${err.message}`,
            err.stack,
          );
          stats.failed++;
        }
      }

      if (newMarksInBatch === 0 && candidates.length > 0) {
        break;
      }
    }
  }
}
