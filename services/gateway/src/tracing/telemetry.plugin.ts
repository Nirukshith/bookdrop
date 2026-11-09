import { Plugin } from '@nestjs/apollo';
import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface TracingContext {
  traceId: string;
  spanId: string;
  startTime: bigint;
  operationName?: string;
}

@Plugin()
export class TelemetryPlugin implements ApolloServerPlugin {
  private readonly logger = new Logger('DistributedTracing');
  private readonly otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    (process.env.NODE_ENV === 'production'
      ? 'http://jaeger-service:4318/v1/traces'
      : undefined);

  async requestDidStart(
    requestContext: GraphQLRequestContext<any>,
  ): Promise<GraphQLRequestListener<any>> {
    const req = requestContext.contextValue?.req;
    const res = requestContext.contextValue?.res;

    // Extract or generate W3C traceparent (format: 00-{traceId}-{spanId}-01)
    const incomingTraceparent = req?.headers?.traceparent as string | undefined;
    const incomingTraceId = req?.headers?.['x-trace-id'] as string | undefined;

    let traceId = incomingTraceId;
    if (!traceId && incomingTraceparent) {
      const parts = incomingTraceparent.split('-');
      if (parts.length >= 2 && parts[1].length === 32) {
        traceId = parts[1];
      }
    }
    if (!traceId) {
      traceId = crypto.randomBytes(16).toString('hex');
    }

    const spanId = crypto.randomBytes(8).toString('hex');
    const startTime = process.hrtime.bigint();

    // Attach to context so RemoteGraphQLDataSource can forward it to subgraphs
    if (requestContext.contextValue) {
      requestContext.contextValue.traceId = traceId;
      requestContext.contextValue.spanId = spanId;
    }

    // Set trace ID on HTTP response header
    if (res?.setHeader) {
      res.setHeader('x-trace-id', traceId);
      res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);
    }

    const otlpEndpoint = this.otlpEndpoint;
    const logger = this.logger;

    return {
      async willSendResponse(ctx: GraphQLRequestContext<any>) {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1_000_000;
        const opName =
          ctx.request.operationName ||
          ctx.operation?.name?.value ||
          'AnonymousOperation';

        logger.log(
          `[Trace ${traceId.substring(0, 8)}] ${opName} completed in ${durationMs.toFixed(2)}ms`,
        );

        if (!otlpEndpoint) return;

        // Construct standard OpenTelemetry OTLP JSON trace payload
        const nowMs = Date.now();
        const startNano = (
          BigInt(nowMs) * 1_000_000n -
          (endTime - startTime)
        ).toString();
        const endNano = (BigInt(nowMs) * 1_000_000n).toString();

        const otlpPayload = {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  {
                    key: 'service.name',
                    value: { stringValue: 'bookdrop-gateway' },
                  },
                ],
              },
              scopeSpans: [
                {
                  scope: { name: 'apollo-supergraph' },
                  spans: [
                    {
                      traceId,
                      spanId,
                      name: `GraphQL: ${opName}`,
                      kind: 1, // SPAN_KIND_SERVER
                      startTimeUnixNano: startNano,
                      endTimeUnixNano: endNano,
                      attributes: [
                        {
                          key: 'graphql.operation.name',
                          value: { stringValue: opName },
                        },
                        {
                          key: 'graphql.duration_ms',
                          value: { doubleValue: durationMs },
                        },
                        {
                          key: 'http.status_code',
                          value: { intValue: 200 },
                        },
                      ],
                      status: { code: 1 }, // STATUS_CODE_OK
                    },
                  ],
                },
              ],
            },
          ],
        };

        // Asynchronously dispatch trace span to Jaeger OTLP receiver (fire-and-forget)
        fetch(otlpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(otlpPayload),
        }).catch((err) => {
          logger.debug(`Could not export trace to Jaeger: ${err.message}`);
        });
      },
    };
  }
}

