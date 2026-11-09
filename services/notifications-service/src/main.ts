import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('NotificationsServiceBootstrap');

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const rabbitmqUrl = configService.get<string>(
    'RABBITMQ_URL',
    'amqp://bookdrop:bookdrop@localhost:5672',
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'bookdrop.notifications',
      noAck: false,
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.startAllMicroservices();
  await app.init();

  logger.log(
    '🚀 Notifications Microservice is active and listening to RabbitMQ queue "bookdrop.notifications"',
  );
}

bootstrap();

