import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  BOOKDROP_NOTIFICATIONS_QUEUE,
  RABBITMQ_SERVICE,
} from './messaging.constants';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const url = config.get<string>('RABBITMQ_URL');
          if (!url) {
            return {
              transport: Transport.RMQ,
              options: {
                urls: ['amqp://bookdrop:bookdrop@localhost:5672'],
                queue: BOOKDROP_NOTIFICATIONS_QUEUE,
                queueOptions: { durable: true },
              },
            };
          }
          return {
            transport: Transport.RMQ,
            options: {
              urls: [url],
              queue: BOOKDROP_NOTIFICATIONS_QUEUE,
              queueOptions: { durable: true },
            },
          };
        },
      },
    ]),
  ],
  providers: [RabbitMQPublisherService],
  exports: [RabbitMQPublisherService, ClientsModule],
})
export class MessagingModule { }

