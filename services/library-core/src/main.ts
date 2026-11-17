import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger/json-logger';
import { BOOKDROP_NOTIFICATIONS_QUEUE } from './common/messaging/messaging.constants';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    logger: isProduction
      ? new JsonLogger()
      : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Trust proxy for load balancer / ALB X-Forwarded-For resolution
  const trustProxy = configService.get<boolean>('TRUST_PROXY', false);
  if (trustProxy) {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
  }

  // CORS configuration
  const allowedOriginsRaw = configService.get<string>('ALLOWED_ORIGINS', '');
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });

  // Security headers with Helmet
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Enable graceful shutdown hooks (finishes in-flight requests and closes DB connection on SIGTERM)
  app.enableShutdownHooks();

  // Connect RabbitMQ microservice listener if configured and not running in standalone worker mode
  const rabbitmqUrl = configService.get<string>('RABBITMQ_URL');
  const isStandaloneNotifications = configService.get<boolean>(
    'NOTIFICATIONS_SERVICE_STANDALONE',
    false,
  );
  if (
    rabbitmqUrl &&
    !isStandaloneNotifications &&
    process.env.NODE_ENV !== 'test'
  ) {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: BOOKDROP_NOTIFICATIONS_QUEUE,
        noAck: false,
        queueOptions: {
          durable: true,
        },
      },
    });
    await app.startAllMicroservices();
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
