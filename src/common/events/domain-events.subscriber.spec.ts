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

    it('intercepts loan.started via wildcard loan.*', async () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 14 * 86400000);
      const event = {
        eventName: 'loan.started',
        domain: 'loan',
        loanId: 1,
        userId: 10,
        bookId: 20,
        copyId: 30,
        borrowedAt: now,
        dueAt,
        source: 'PICKUP',
      };

      eventEmitter.emit('loan.started', event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'loan',
          eventName: 'loan.started',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts hold.fulfilled via wildcard hold.*', async () => {
      const event = {
        eventName: 'hold.fulfilled',
        domain: 'circulation',
        holdId: 1,
        loanId: 10,
      };

      eventEmitter.emit('hold.fulfilled', event);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'hold',
          eventName: 'hold.fulfilled',
          payload: event,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts fine.payment_recorded and fine.settled via wildcard fine.*', async () => {
      const now = new Date();
      const paymentEvent = {
        eventName: 'fine.payment_recorded',
        domain: 'fine',
        fineId: 101,
        paymentId: 1,
        userId: 42,
        amountMinor: 200,
        paidMinor: 200,
        remainingMinor: 300,
        receivedById: 5,
        occurredAt: now,
      };

      eventEmitter.emit('fine.payment_recorded', paymentEvent);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'fine',
          eventName: 'fine.payment_recorded',
          payload: paymentEvent,
        },
        'DomainEventsSubscriber',
      );

      const settledEvent = {
        eventName: 'fine.settled',
        domain: 'fine',
        fineId: 101,
        userId: 42,
        reason: 'LATE_RETURN',
        status: 'PAID',
        settledAt: now,
        occurredAt: now,
      };

      eventEmitter.emit('fine.settled', settledEvent);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'fine',
          eventName: 'fine.settled',
          payload: settledEvent,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts loan.returned and loan.lost via wildcard loan.*', async () => {
      const now = new Date();
      const returnedEvent = {
        eventName: 'loan.returned',
        domain: 'loan',
        loanId: 10,
        userId: 20,
        bookId: 30,
        copyId: 40,
        returnedAt: now,
        daysLate: 2,
        condition: 'GOOD',
      };

      eventEmitter.emit('loan.returned', returnedEvent);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'loan',
          eventName: 'loan.returned',
          payload: returnedEvent,
        },
        'DomainEventsSubscriber',
      );

      const lostEvent = {
        eventName: 'loan.lost',
        domain: 'loan',
        loanId: 10,
        userId: 20,
        bookId: 30,
        copyId: 40,
      };

      eventEmitter.emit('loan.lost', lostEvent);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'loan',
          eventName: 'loan.lost',
          payload: lostEvent,
        },
        'DomainEventsSubscriber',
      );
    });

    it('intercepts fine.created via wildcard fine.*', async () => {
      const fineEvent = {
        eventName: 'fine.created',
        domain: 'fine',
        fineId: 50,
        userId: 20,
        reason: 'LATE_RETURN',
        amountMinor: 2000,
        loanId: 10,
      };

      eventEmitter.emit('fine.created', fineEvent);

      expect(loggerMock.log).toHaveBeenCalledWith(
        {
          domain: 'fine',
          eventName: 'fine.created',
          payload: fineEvent,
        },
        'DomainEventsSubscriber',
      );
    });
  });
});
