import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JsonLogger } from '../logger/json-logger';

@Injectable()
export class DomainEventsSubscriber {
  constructor(private readonly logger: JsonLogger = new JsonLogger()) {}

  @OnEvent('hold.*')
  handleHoldEvent(event: any): void {
    this.logger.log(
      {
        domain: 'hold',
        eventName: event?.eventName ?? event?.constructor?.name ?? 'hold.*',
        payload: event,
      },
      DomainEventsSubscriber.name,
    );
  }

  @OnEvent('copy.*')
  handleCopyEvent(event: any): void {
    this.logger.log(
      {
        domain: 'copy',
        eventName: event?.eventName ?? event?.constructor?.name ?? 'copy.*',
        payload: event,
      },
      DomainEventsSubscriber.name,
    );
  }

  @OnEvent('loan.*')
  handleLoanEvent(event: any): void {
    this.logger.log(
      {
        domain: 'loan',
        eventName: event?.eventName ?? event?.constructor?.name ?? 'loan.*',
        payload: event,
      },
      DomainEventsSubscriber.name,
    );
  }

  @OnEvent('fine.*')
  handleFineEvent(event: any): void {
    this.logger.log(
      {
        domain: 'fine',
        eventName: event?.eventName ?? event?.constructor?.name ?? 'fine.*',
        payload: event,
      },
      DomainEventsSubscriber.name,
    );
  }

  @OnEvent('book.*')
  handleBookEvent(event: any): void {
    this.logger.log(
      {
        domain: 'book',
        eventName: event?.eventName ?? event?.constructor?.name ?? 'book.*',
        payload: event,
      },
      DomainEventsSubscriber.name,
    );
  }

  @OnEvent('reservation.*')
  handleReservationEvent(event: any): void {
    this.logger.log(
      {
        domain: 'reservation',
        eventName:
          event?.eventName ?? event?.constructor?.name ?? 'reservation.*',
        payload: event,
      },
      DomainEventsSubscriber.name,
    );
  }
}
