import { Global, Module } from '@nestjs/common';
import { DomainEventsSubscriber } from './domain-events.subscriber';
import { JsonLogger } from '../logger/json-logger';

@Global()
@Module({
  providers: [JsonLogger, DomainEventsSubscriber],
  exports: [DomainEventsSubscriber, JsonLogger],
})
export class DomainEventsModule {}
