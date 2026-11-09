import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OnEvent } from '@nestjs/event-emitter';
import { lastValueFrom } from 'rxjs';
import { RABBITMQ_SERVICE } from './messaging.constants';

@Injectable()
export class RabbitMQPublisherService {
  private readonly logger = new Logger(RabbitMQPublisherService.name);

  constructor(
    @Optional()
    @Inject(RABBITMQ_SERVICE)
    private readonly client?: ClientProxy,
  ) { }

  @OnEvent('user.*')
  async handleDomainEvent(payload: any): Promise<void> {
    const pattern = payload?.eventName || 'user.registered';
    await this.publish(pattern, payload);
  }

  async publish(pattern: string, data: any): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await lastValueFrom(this.client.emit(pattern, data));
      this.logger.debug(`Published event to RabbitMQ [${pattern}]`);
    } catch (err: any) {
      this.logger.warn(
        `Failed to publish event to RabbitMQ [${pattern}]: ${err.message}`,
      );
    }
  }
}

