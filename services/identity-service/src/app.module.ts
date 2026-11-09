import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import * as depthLimit from 'graphql-depth-limit';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { MessagingModule } from './messaging/messaging.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    MessagingModule,
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
    GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd =
          process.env.NODE_ENV === 'production' ||
          configService.get<string>('NODE_ENV') === 'production';
        return {
          autoSchemaFile: {
            federation: 2,
            path: join(process.cwd(), 'src/schema.gql'),
          },
          sortSchema: true,
          playground: !isProd,
          introspection: !isProd,
          validationRules: [depthLimit(5)],
          fieldResolverEnhancers: ['guards'],
          context: ({ req, res }: { req: unknown; res: unknown }) => ({
            req,
            res,
          }),
        };
      },
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule { }

