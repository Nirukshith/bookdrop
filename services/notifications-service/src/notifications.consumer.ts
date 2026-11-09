import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { DOMAIN_EVENT_NAMES } from './contracts/events';
import { NotificationsSubscriber } from './notifications.subscriber';

@Controller()
export class NotificationsConsumer {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(private readonly subscriber: NotificationsSubscriber) { }

  @EventPattern(Object.values(DOMAIN_EVENT_NAMES))
  async handleRabbitMQEvent(
    @Payload() data: any,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context?.getChannelRef?.();
    const originalMsg = context?.getMessage?.();

    try {
      await this.subscriber.enqueueNotification(data);
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
      this.logger.debug(
        `Successfully processed and acknowledged RabbitMQ event: ${data?.eventName || 'unknown'}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to process RabbitMQ event: ${err.message}`,
        err.stack,
      );
      if (channel && originalMsg) {
        channel.nack(originalMsg, false, false);
      }
    }
  }
}

