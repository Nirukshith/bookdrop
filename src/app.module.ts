import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import * as depthLimit from 'graphql-depth-limit';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { BooksModule } from './books/books.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { CopiesModule } from './circulation/copies/copies.module';
import { HoldsModule } from './circulation/holds/holds.module';
import { LoansModule } from './circulation/loans/loans.module';
import { ClockModule } from './common/clock/clock.module';
import { DomainEventsModule } from './common/events/domain-events.module';
import { GqlThrottlerGuard } from './auth/guards/gql-throttler.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ClockModule,
    DomainEventsModule,
    HoldsModule,
    EventEmitterModule.forRoot({ wildcard: true }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd =
          process.env.NODE_ENV === 'production' ||
          configService.get<string>('NODE_ENV') === 'production';
        return {
          autoSchemaFile: isProd ? true : join(process.cwd(), 'src/schema.gql'),
          sortSchema: true,
          playground: !isProd,
          introspection: !isProd,
          validationRules: [depthLimit(5)],
          fieldResolverEnhancers: ['guards'],
          context: ({ req, res }: { req: unknown; res: unknown }) => ({
            req,
            res,
          }),
          formatError: (formattedError, error: any) => {
            const originalError =
              error?.extensions?.originalError || error?.originalError;
            const rawCode =
              originalError?.code ||
              error?.extensions?.code ||
              (formattedError.extensions?.code as string);

            let code = rawCode;
            const status =
              originalError?.statusCode || error?.extensions?.status;

            if (status === 403 || rawCode === 'FORBIDDEN') {
              code = 'FORBIDDEN';
            } else if (status === 401 || rawCode === 'UNAUTHENTICATED') {
              code = 'UNAUTHENTICATED';
            } else if (formattedError.message?.includes('Too Many Requests')) {
              code = 'TOO_MANY_REQUESTS';
            }

            const extensions: Record<string, any> = {
              ...formattedError.extensions,
              code: code || 'INTERNAL_SERVER_ERROR',
            };

            if (isProd) {
              delete extensions.stacktrace;
            }

            return {
              message: formattedError.message,
              locations: formattedError.locations,
              path: formattedError.path,
              extensions,
            };
          },
        };
      },
    }),
    PrismaModule,
    BooksModule,
    UsersModule,
    AuthModule,
    HealthModule,
    CopiesModule,
    LoansModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
