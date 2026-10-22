import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventsSubscriber } from './domain-events.subscriber';
import { JsonLogger } from '../logger/json-logger';
import {
  HoldCreatedEvent,
  HoldCancelledEvent,
  HoldExpiredEvent,
} from '../../circulation/holds/events';
import {
  CopyCreatedEvent,
  CopyStatusChangedEvent,
} from '../../circulation/copies/events';
import { CopyStatus } from '@prisma/client';

describe('DomainEventsSubscriber', () => {
  let subscriber: DomainEventsSubscriber;
  let eventEmitter: EventEmitter2;
  let loggerMock: jest.Mocked<JsonLogger>;

  beforeEach(async () => {
    loggerMock = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as unknown as jest.Mocked<JsonLogger>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true })],
      providers: [
        DomainEventsSubscriber,
        {
          provide: JsonLogger,
          useValue: loggerMock,
        },
      ],
    }).compile();

    await module.init();

    subscriber = module.get<DomainEventsSubscriber>(DomainEventsSubscriber);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('is defined', () => {
    expect(subscriber).toBeDefined();
  });

  describe('Direct handler invocations', () => {
    it('logs hold event with structured payload via JsonLogger', () => {
      const now = new Date();
      const event = new HoldCreatedEvent(101, 202, 303, 404, now, now);

      subscriber.handleHoldEvent(event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'hold',
          eventName: 'hold.created',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('logs copy event with structured payload via JsonLogger', () => {
      const now = new Date();
      const event = new CopyStatusChangedEvent(
        404,
        303,
        CopyStatus.AVAILABLE,
        CopyStatus.ON_HOLD,
        'Hold placed',
        202,
        now,
      );

      subscriber.handleCopyEvent(event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'copy',
          eventName: 'copy.status_changed',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('gracefully handles events without eventName property', () => {
      const payload = { holdId: 99 };
      subscriber.handleHoldEvent(payload);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'hold',
          eventName: 'Object',
          payload,
        },
        'DomainEventsSubscriber',
      );
    });
  });

  describe('Wildcard Event Interception via EventEmitter', () => {
    it('intercepts hold.created via wildcard hold.*', async () => {
      const expiresAt = new Date();
      const event = new HoldCreatedEvent(1, 2, 3, 4, expiresAt, expiresAt);

      eventEmitter.emit(HoldCreatedEvent.EVENT_NAME, event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'hold',
          eventName: 'hold.created',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts hold.cancelled with member cancelledBy via wildcard hold.*', async () => {
      const now = new Date();
      const event = new HoldCancelledEvent(
        1,
        'member',
        'Changed my mind',
        2,
        3,
        4,
        2,
        now,
      );

      eventEmitter.emit(HoldCancelledEvent.EVENT_NAME, event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'hold',
          eventName: 'hold.cancelled',
          payload: expect.objectContaining({
            holdId: 1,
            cancelledBy: 'member',
            reason: 'Changed my mind',
          }),
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts hold.expired via wildcard hold.*', async () => {
      const now = new Date();
      const event = new HoldExpiredEvent(1, 2, 3, 4, now);

      eventEmitter.emit(HoldExpiredEvent.EVENT_NAME, event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'hold',
          eventName: 'hold.expired',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts copy.created via wildcard copy.*', async () => {
      const now = new Date();
      const event = new CopyCreatedEvent(
        10,
        20,
        'BD-001-01',
        CopyStatus.AVAILABLE,
        'STACK-01',
        1,
        now,
      );

      eventEmitter.emit(CopyCreatedEvent.EVENT_NAME, event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'copy',
          eventName: 'copy.created',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts copy.status_changed via wildcard copy.*', async () => {
      const now = new Date();
      const event = new CopyStatusChangedEvent(
        10,
        20,
        CopyStatus.AVAILABLE,
        CopyStatus.ON_HOLD,
        'Reserved',
        1,
        now,
      );

      eventEmitter.emit(CopyStatusChangedEvent.EVENT_NAME, event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'copy',
          eventName: 'copy.status_changed',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });
  });
});
