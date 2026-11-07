import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { mapEventToNotification } from './notification-mapper';
import { NotificationStatus } from './notification.types';

@Injectable()
export class NotificationsSubscriber {
  private readonly logger = new Logger(NotificationsSubscriber.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('hold.*')
  async handleHoldEvent(event: any): Promise<void> {
    await this.enqueueNotification(event);
  }

  @OnEvent('loan.*')
  async handleLoanEvent(event: any): Promise<void> {
    await this.enqueueNotification(event);
  }

  @OnEvent('fine.*')
  async handleFineEvent(event: any): Promise<void> {
    await this.enqueueNotification(event);
  }

  @OnEvent('reservation.*')
  async handleReservationEvent(event: any): Promise<void> {
    await this.enqueueNotification(event);
  }

  @OnEvent('missed_pickup.*')
  async handleMissedPickupEvent(event: any): Promise<void> {
    await this.enqueueNotification(event);
  }

  @OnEvent('user.*')
  async handleUserEvent(event: any): Promise<void> {
    await this.enqueueNotification(event);
  }

  /**
   * Enqueues a notification row in the database based on the pure mapping table.
   *
   * Safety rules:
   * 1. If mapping returns null, skips immediately.
   * 2. Uses upsert with empty update (ON CONFLICT DO NOTHING) for strict idempotency.
   * 3. Wrapped in a top-level try/catch that logs and NEVER rethrows,
   *    ensuring an enqueue failure can NEVER bubble up to the domain transaction or event bus.
   */
  async enqueueNotification(event: any): Promise<void> {
    try {
      const mapped = mapEventToNotification(event);
      if (!mapped) {
        return;
      }

      await this.prisma.notification.upsert({
        where: { dedupeKey: mapped.dedupeKey },
        create: {
          userId: mapped.userId,
          template: mapped.template,
          dedupeKey: mapped.dedupeKey,
          payload: mapped.payload,
          validUntil: mapped.validUntil,
          status: NotificationStatus.PENDING,
          nextAttemptAt: new Date(),
        },
        update: {}, // Idempotent ON CONFLICT DO NOTHING
      });

      this.logger.debug(
        `Enqueued notification: dedupeKey="${mapped.dedupeKey}" template="${mapped.template}" userId=${mapped.userId}`,
      );
    } catch (err: any) {
      // Top-level error shield: log error, never throw to caller
      this.logger.error(
        `Failed to enqueue notification for event "${event?.eventName || 'unknown'}": ${err.message}`,
        err.stack,
      );
    }
  }
}
