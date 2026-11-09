import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('ApolloGateway');
  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(
    `🌐 Apollo Supergraph Gateway running on http://localhost:${port}/graphql`,
  );
}
bootstrap();

