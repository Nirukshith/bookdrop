import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailProvider,
  PermanentEmailError,
} from '../providers/email-provider.interface';
import { TokenBucketRateLimiter } from '../rate-limiter/token-bucket.rate-limiter';
import { renderEmail } from '../templates/email-templates';
import {
  computeBackoffMs,
  DEFAULT_LIBRARY_TIMEZONE,
  NOTIFICATION_BATCH_SIZE,
  NOTIFICATION_LOCK_SECONDS,
  NOTIFICATION_MAX_ATTEMPTS,
} from '../config/notification.config';
import { NotificationTemplate } from '../notification.types';

export interface NotificationJobStats {
  processed: number;
  failed: number;
  eventsEmitted: number;
  staleCancelled: number;
  reclaimed: number;
  batches: number;
  [key: string]: any;
}

export interface NotificationJobContext {
  readonly clock: { now(): Date };
  readonly batchSize: number;
  readonly maxRunSeconds: number;
  renewLease(): Promise<void>;
  isAborted(): boolean;
  timeRemainingMs(): number;
}

export interface ClaimedNotificationRow {
  id: number;
  userId: number;
  template: NotificationTemplate;
  dedupeKey: string;
  payload: any;
  attempts: number;
  validUntil: Date | null;
}

@Injectable()
export class SendNotificationsJob implements OnModuleInit {
  private readonly logger = new Logger(SendNotificationsJob.name);
  private isRunning = false;
  private readonly schedulerEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('EMAIL_PROVIDER')
    private readonly emailProvider: EmailProvider,
    @Inject('EMAIL_RATE_LIMITER')
    private readonly rateLimiter: TokenBucketRateLimiter,
    private readonly configService: ConfigService,
  ) {
    this.schedulerEnabled = this.configService.get<boolean>(
      'SCHEDULER_ENABLED',
      true,
    );
  }

  onModuleInit() {
    this.logger.log(
      `SendNotificationsJob initialized (schedulerEnabled=${this.schedulerEnabled})`,
    );
  }

  @Interval(30000)
  async handleCron(): Promise<void> {
    if (!this.schedulerEnabled || this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const startTime = Date.now();
      const defaultContext: NotificationJobContext = {
        clock: { now: () => new Date() },
        batchSize: this.configService.get<number>(
          'NOTIFICATION_BATCH_SIZE',
          NOTIFICATION_BATCH_SIZE,
        ),
        maxRunSeconds: 25,
        renewLease: async () => {},
        isAborted: () => false,
        timeRemainingMs: () => Math.max(0, 25000 - (Date.now() - startTime)),
      };
      await this.run(defaultContext);
    } catch (err: any) {
      this.logger.error(
        `Unexpected error in background notifications sweep: ${err.message}`,
        err.stack,
      );
    } finally {
      this.isRunning = false;
    }
  }

  async run(context: NotificationJobContext): Promise<NotificationJobStats> {
    const stats: NotificationJobStats = {
      processed: 0,
      failed: 0,
      eventsEmitted: 0,
      staleCancelled: 0,
      reclaimed: 0,
      batches: 0,
    };

    const workerId = `worker-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
    const batchSize = context.batchSize || NOTIFICATION_BATCH_SIZE;

    while (context.timeRemainingMs() > 0 && !context.isAborted()) {
      await context.renewLease();
      const now = context.clock.now();

      // 1. Reclaim crashed/stale SENDING rows whose lockedUntil has expired
      const reclaimed = await this.prisma.$executeRaw`
        UPDATE "Notification"
        SET "status" = 'PENDING',
            "lockedUntil" = NULL,
            "lockedBy" = NULL,
            "lastError" = 'Reclaimed after lock timeout',
            "updatedAt" = ${now}
        WHERE "status" = 'SENDING'
          AND "lockedUntil" IS NOT NULL
          AND "lockedUntil" <= ${now}
      `;
      stats.reclaimed += Number(reclaimed || 0);

      // 2. Drop time-sensitive pending notifications whose validUntil has elapsed
      const cancelled = await this.prisma.$executeRaw`
        UPDATE "Notification"
        SET "status" = 'CANCELLED',
            "updatedAt" = ${now}
        WHERE "status" = 'PENDING'
          AND "validUntil" IS NOT NULL
          AND "validUntil" <= ${now}
      `;
      stats.staleCancelled += Number(cancelled || 0);

      // 3. Atomically claim up to batchSize PENDING rows with FOR UPDATE SKIP LOCKED
      const lockExpiry = new Date(
        now.getTime() + NOTIFICATION_LOCK_SECONDS * 1000,
      );
      const claimedRows = await this.prisma.$queryRaw<ClaimedNotificationRow[]>`
        WITH candidates AS (
          SELECT id FROM "Notification"
          WHERE "status" = 'PENDING'
            AND "nextAttemptAt" <= ${now}
            AND ("validUntil" IS NULL OR "validUntil" > ${now})
          ORDER BY "nextAttemptAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "Notification" n
        SET "status" = 'SENDING',
            "lockedUntil" = ${lockExpiry},
            "lockedBy" = ${workerId},
            "lastAttemptAt" = ${now},
            "updatedAt" = ${now}
        FROM candidates c
        WHERE n.id = c.id
        RETURNING n.id, n."userId", n.template, n."dedupeKey", n.payload, n.attempts, n."validUntil"
      `;

      if (!claimedRows || claimedRows.length === 0) {
        break;
      }

      stats.batches++;

      // 4. Batch-resolve recipient identities and book titles
      // Check if details are already in the payload (self-contained events)
      const missingUserIds = claimedRows
        .filter((r) => !r.payload?.userEmail && !r.payload?.email)
        .map((r) => r.userId);

      const userMap = new Map<number, { name: string; email: string }>();
      if (missingUserIds.length > 0) {
        const users = await this.prisma.$queryRaw<
          { id: number; name: string; email: string }[]
        >`
          SELECT id, name, email FROM "User" WHERE id IN (${Prisma.join(missingUserIds)})
        `.catch(() => []);
        users.forEach((u: { id: number; name: string; email: string }) =>
          userMap.set(u.id, u),
        );
      }

      const bookIds = Array.from(
        new Set(
          claimedRows
            .map((r) => r.payload?.bookId)
            .filter(
              (id): id is number =>
                typeof id === 'number' && Number.isInteger(id),
            ),
        ),
      );

      const titleMap = new Map<number, string>();
      if (bookIds.length > 0) {
        const books = await this.prisma.$queryRaw<
          { id: number; title: string }[]
        >`
          SELECT id, title FROM "Book" WHERE id IN (${Prisma.join(bookIds)})
        `.catch(() => []);
        books.forEach((b: { id: number; title: string }) =>
          titleMap.set(b.id, b.title),
        );
      }

      const timezone =
        this.configService.get<string>('LIBRARY_TIMEZONE') ||
        DEFAULT_LIBRARY_TIMEZONE;

      // 5. Process claimed rows
      for (const row of claimedRows) {
        if (context.isAborted() || context.timeRemainingMs() <= 0) {
          this.logger.warn(
            `Time budget exhausted or aborted during send-notifications batch. Stopping sweep.`,
          );
          break;
        }

        const recipientEmail =
          row.payload?.userEmail ||
          row.payload?.email ||
          userMap.get(row.userId)?.email;

        const recipientName =
          row.payload?.userName ||
          row.payload?.name ||
          userMap.get(row.userId)?.name ||
          'Library Patron';

        if (!recipientEmail) {
          this.logger.error(
            `Cannot send notification #${row.id}: Recipient email for User #${row.userId} not found. Marking as FAILED.`,
          );
          await this.prisma.$executeRaw`
            UPDATE "Notification"
            SET "status" = 'FAILED',
                "attempts" = "attempts" + 1,
                "lastError" = 'Recipient user email not found',
                "lockedUntil" = NULL,
                "lockedBy" = NULL,
                "updatedAt" = ${context.clock.now()}
            WHERE id = ${row.id}
          `;
          stats.failed++;
          continue;
        }

        const bookTitle =
          row.payload?.bookTitle ||
          (row.payload?.bookId ? titleMap.get(row.payload.bookId) : undefined);

        try {
          const rendered = renderEmail(row.template, {
            recipientName,
            recipientEmail,
            bookTitle,
            ...row.payload,
            timezone,
          });

          // Pacing via TokenBucketRateLimiter
          await this.rateLimiter.acquire();

          const emailFrom = this.configService.get<string>(
            'EMAIL_FROM',
            'Bookdrop Library <no-reply@bookdrop.io>',
          );

          await this.emailProvider.sendEmail({
            to: recipientEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            from: emailFrom,
          });

          // Success: Mark SENT
          await this.prisma.$executeRaw`
            UPDATE "Notification"
            SET "status" = 'SENT',
                "sentAt" = ${context.clock.now()},
                "attempts" = "attempts" + 1,
                "lockedUntil" = NULL,
                "lockedBy" = NULL,
                "lastError" = NULL,
                "updatedAt" = ${context.clock.now()}
            WHERE id = ${row.id}
          `;
          stats.processed++;
        } catch (err: any) {
          const isPermanent =
            err instanceof PermanentEmailError ||
            (typeof err?.isRetryable === 'boolean' && !err.isRetryable);
          const currentAttempts = row.attempts + 1;
          const maxReached = currentAttempts >= NOTIFICATION_MAX_ATTEMPTS;

          if (isPermanent || maxReached) {
            this.logger.error(
              `Permanent failure sending notification #${row.id} (template=${row.template}): ${err.message}`,
            );
            await this.prisma.$executeRaw`
              UPDATE "Notification"
              SET "status" = 'FAILED',
                  "attempts" = ${currentAttempts},
                  "lastError" = ${String(err.message || err)},
                  "lockedUntil" = NULL,
                  "lockedBy" = NULL,
                  "updatedAt" = ${context.clock.now()}
              WHERE id = ${row.id}
            `;
            stats.failed++;
          } else {
            const backoffMs = computeBackoffMs(currentAttempts);
            const nextAttemptAt = new Date(
              context.clock.now().getTime() + backoffMs,
            );
            this.logger.warn(
              `Transient failure sending notification #${row.id} (attempt ${currentAttempts}/${NOTIFICATION_MAX_ATTEMPTS}): ${err.message}. Retrying at ${nextAttemptAt.toISOString()}`,
            );
            await this.prisma.$executeRaw`
              UPDATE "Notification"
              SET "status" = 'PENDING',
                  "attempts" = ${currentAttempts},
                  "nextAttemptAt" = ${nextAttemptAt},
                  "lastError" = ${String(err.message || err)},
                  "lockedUntil" = NULL,
                  "lockedBy" = NULL,
                  "updatedAt" = ${context.clock.now()}
              WHERE id = ${row.id}
            `;
            stats.failed++;
          }
        }
      }
    }

    return stats;
  }
}
