import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  RABBITMQ_SERVICE,
  BOOKDROP_NOTIFICATIONS_QUEUE,
} from './messaging.constants';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_SERVICE,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(
                'RABBITMQ_URL',
                'amqp://bookdrop:bookdrop@localhost:5672',
              ),
            ],
            queue: BOOKDROP_NOTIFICATIONS_QUEUE,
            queueOptions: {
              durable: true,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [RabbitMQPublisherService],
  exports: [ClientsModule, RabbitMQPublisherService],
})
export class MessagingModule {}
