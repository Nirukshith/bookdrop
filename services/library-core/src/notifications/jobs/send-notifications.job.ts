import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import { CATALOG_PUBLIC_API, CatalogPublicApi } from '../../books';
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
  NOTIFICATION_JOB_INTERVAL_SECONDS,
  NOTIFICATION_LOCK_SECONDS,
  NOTIFICATION_MAX_ATTEMPTS,
} from '../../config/library-rules';
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
export class SendNotificationsJob {
  readonly name = 'send-notifications';
  readonly intervalSeconds = NOTIFICATION_JOB_INTERVAL_SECONDS;
  private readonly logger = new Logger(SendNotificationsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityApi: IdentityPublicApi,
    @Inject(CATALOG_PUBLIC_API)
    private readonly catalogApi: CatalogPublicApi,
    @Inject('EMAIL_PROVIDER')
    private readonly emailProvider: EmailProvider,
    @Inject('EMAIL_RATE_LIMITER')
    private readonly rateLimiter: TokenBucketRateLimiter,
  ) {}

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
      const userIds = Array.from(new Set(claimedRows.map((r) => r.userId)));
      const members = await this.identityApi.getMembersByIds(userIds);
      const memberMap = new Map(members.map((m) => [m.id, m]));

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
      const titleMap =
        bookIds.length > 0
          ? await this.catalogApi.findTitlesByIds(bookIds)
          : new Map();

      const timezone = process.env.LIBRARY_TIMEZONE || DEFAULT_LIBRARY_TIMEZONE;

      // 5. Process claimed rows
      for (const row of claimedRows) {
        if (context.isAborted() || context.timeRemainingMs() <= 0) {
          this.logger.warn(
            `Time budget exhausted or aborted during send-notifications batch. Stopping sweep.`,
          );
          break;
        }

        const member = memberMap.get(row.userId);
        if (!member) {
          this.logger.error(
            `Cannot send notification #${row.id}: User #${row.userId} not found. Marking as FAILED.`,
          );
          await this.prisma.$executeRaw`
            UPDATE "Notification"
            SET "status" = 'FAILED',
                "attempts" = "attempts" + 1,
                "lastError" = 'Recipient user not found',
                "lockedUntil" = NULL,
                "lockedBy" = NULL,
                "updatedAt" = ${context.clock.now()}
            WHERE id = ${row.id}
          `;
          stats.failed++;
          continue;
        }

        const bookTitle = row.payload?.bookId
          ? titleMap.get(row.payload.bookId) || 'Library Book'
          : undefined;

        try {
          const rendered = renderEmail(row.template, {
            recipientName: member.name,
            recipientEmail: member.email,
            bookTitle,
            ...row.payload,
            timezone,
          });

          // Pacing: Wait for rate limit token (e.g. 1/sec for SES Sandbox)
          await this.rateLimiter.acquire(1);

          await this.emailProvider.sendEmail({
            to: member.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });

          // Success: Mark as SENT
          await this.prisma.$executeRaw`
            UPDATE "Notification"
            SET "status" = 'SENT',
                "sentAt" = ${context.clock.now()},
                "attempts" = "attempts" + 1,
                "lastError" = NULL,
                "lockedUntil" = NULL,
                "lockedBy" = NULL,
                "updatedAt" = ${context.clock.now()}
            WHERE id = ${row.id}
          `;
          stats.processed++;
        } catch (err: any) {
          const nextAttemptCount = row.attempts + 1;
          const isPermanent =
            err instanceof PermanentEmailError ||
            nextAttemptCount >= NOTIFICATION_MAX_ATTEMPTS;

          if (isPermanent) {
            this.logger.error(
              `Permanent failure sending notification #${row.id} (template=${row.template}): ${err.message}`,
              err.stack,
            );
            await this.prisma.$executeRaw`
              UPDATE "Notification"
              SET "status" = 'FAILED',
                  "attempts" = ${nextAttemptCount},
                  "lastError" = ${err.message || 'Permanent delivery failure'},
                  "lockedUntil" = NULL,
                  "lockedBy" = NULL,
                  "updatedAt" = ${context.clock.now()}
              WHERE id = ${row.id}
            `;
          } else {
            const backoffMs = computeBackoffMs(row.attempts);
            const nextAttemptAt = new Date(
              context.clock.now().getTime() + backoffMs,
            );
            this.logger.warn(
              `Transient failure sending notification #${row.id} (attempt ${nextAttemptCount}/${NOTIFICATION_MAX_ATTEMPTS}): ${err.message}. Retrying at ${nextAttemptAt.toISOString()}`,
            );
            await this.prisma.$executeRaw`
              UPDATE "Notification"
              SET "status" = 'PENDING',
                  "attempts" = ${nextAttemptCount},
                  "nextAttemptAt" = ${nextAttemptAt},
                  "lastError" = ${err.message || 'Transient delivery error'},
                  "lockedUntil" = NULL,
                  "lockedBy" = NULL,
                  "updatedAt" = ${context.clock.now()}
              WHERE id = ${row.id}
            `;
          }
          stats.failed++;
        }
      }
    }

    return stats;
  }
}
