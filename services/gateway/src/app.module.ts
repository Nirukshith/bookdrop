import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { AppController } from './app.controller';
import { envValidationSchema } from './config/env.validation';
import { TelemetryPlugin } from './tracing/telemetry.plugin';

export class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }: any) {
    if (context?.req?.headers?.authorization) {
      request.http?.headers.set(
        'authorization',
        context.req.headers.authorization,
      );
    }
    // Propagate W3C distributed trace context to downstream subgraphs
    if (context?.traceId) {
      request.http?.headers.set('x-trace-id', context.traceId);
      request.http?.headers.set(
        'traceparent',
        `00-${context.traceId}-${context.spanId || '0000000000000000'}-01`,
      );
    }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    GraphQLModule.forRootAsync<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const identityUrl = configService.get<string>(
          'IDENTITY_SUBGRAPH_URL',
          'http://localhost:3001/graphql',
        );
        const libraryCoreUrl = configService.get<string>(
          'LIBRARY_CORE_SUBGRAPH_URL',
          'http://localhost:3002/graphql',
        );

        return {
          gateway: {
            supergraphSdl: new IntrospectAndCompose({
              subgraphs: [
                { name: 'identity', url: identityUrl },
                { name: 'library-core', url: libraryCoreUrl },
              ],
            }),
            buildService({ url }: { url?: string }) {
              return new AuthenticatedDataSource({ url });
            },
          },
          server: {
            cors: true,
            context: ({ req, res }: { req: unknown; res: unknown }) => ({
              req,
              res,
            }),
          },
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [TelemetryPlugin],
})
export class AppModule {}

