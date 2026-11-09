import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('NotificationsServiceBootstrap');

  // createMicroservice — no HTTP platform needed (pure RabbitMQ consumer)
  const rabbitmqUrl =
    process.env.RABBITMQ_URL ?? 'amqp://bookdrop:bookdrop@localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'bookdrop.notifications',
        noAck: false,
        queueOptions: { durable: true },
      },
    },
  );

  await app.listen();

  logger.log(
    '🚀 Notifications Microservice is active and listening to RabbitMQ queue "bookdrop.notifications"',
  );
}

bootstrap();
