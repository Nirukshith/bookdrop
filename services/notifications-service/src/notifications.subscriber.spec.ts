import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsSubscriber } from './notifications.subscriber';
import { PrismaService } from './prisma/prisma.service';
import { DOMAIN_EVENT_NAMES } from './contracts/events';
import { NotificationStatus, NotificationTemplate } from './notification.types';

describe('NotificationsSubscriber (Unit Tests)', () => {
  let subscriber: NotificationsSubscriber;
  let prisma: {
    notification: {
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsSubscriber,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    subscriber = module.get<NotificationsSubscriber>(NotificationsSubscriber);
  });

  it('enqueues a hold.created event as HOLD_CONFIRMED with validUntil', async () => {
    const expiresAt = new Date('2026-11-10T10:00:00.000Z');
    await subscriber.handleHoldEvent({
      eventName: DOMAIN_EVENT_NAMES.HOLD_CREATED,
      holdId: 101,
      userId: 5,
      bookId: 42,
      copyId: 99,
      expiresAt,
      source: 'REQUEST',
    });

    expect(prisma.notification.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'hold-confirmed:101' },
      create: expect.objectContaining({
        userId: 5,
        template: NotificationTemplate.HOLD_CONFIRMED,
        dedupeKey: 'hold-confirmed:101',
        status: NotificationStatus.PENDING,
        validUntil: expiresAt,
        payload: {
          holdId: 101,
          bookId: 42,
          copyId: 99,
          expiresAt,
        },
      }),
      update: {},
    });
  });

  it('skips hold.created when source is QUEUE_PROMOTION', async () => {
    await subscriber.handleHoldEvent({
      eventName: DOMAIN_EVENT_NAMES.HOLD_CREATED,
      holdId: 102,
      userId: 5,
      bookId: 42,
      copyId: 99,
      expiresAt: new Date(),
      source: 'QUEUE_PROMOTION',
    });

    expect(prisma.notification.upsert).not.toHaveBeenCalled();
  });

  it('skips hold.cancelled when cancelledBy is member', async () => {
    await subscriber.handleHoldEvent({
      eventName: DOMAIN_EVENT_NAMES.HOLD_CANCELLED,
      holdId: 103,
      userId: 5,
      bookId: 42,
      cancelledBy: 'member',
    });

    expect(prisma.notification.upsert).not.toHaveBeenCalled();
  });

  it('enqueues hold.cancelled when cancelledBy is staff', async () => {
    await subscriber.handleHoldEvent({
      eventName: DOMAIN_EVENT_NAMES.HOLD_CANCELLED,
      holdId: 104,
      userId: 5,
      bookId: 42,
      cancelledBy: 'staff',
      reason: 'Physical copy damaged',
    });

    expect(prisma.notification.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'hold-cancelled:104' },
      create: expect.objectContaining({
        userId: 5,
        template: NotificationTemplate.HOLD_CANCELLED_BY_STAFF,
        dedupeKey: 'hold-cancelled:104',
      }),
      update: {},
    });
  });

  it('enqueues loan.started as LOAN_STARTED', async () => {
    const dueAt = new Date('2026-11-24T23:59:59.000Z');
    await subscriber.handleLoanEvent({
      eventName: DOMAIN_EVENT_NAMES.LOAN_STARTED,
      loanId: 201,
      userId: 6,
      bookId: 15,
      dueAt,
    });

    expect(prisma.notification.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'loan-started:201' },
      create: expect.objectContaining({
        userId: 6,
        template: NotificationTemplate.LOAN_STARTED,
        dedupeKey: 'loan-started:201',
      }),
      update: {},
    });
  });

  it('enqueues fine.settled as FINE_PAID or FINE_WAIVED', async () => {
    await subscriber.handleFineEvent({
      eventName: DOMAIN_EVENT_NAMES.FINE_SETTLED,
      fineId: 301,
      userId: 7,
      status: 'PAID',
      amountMinor: 2500,
      reason: 'LATE_RETURN',
    });

    expect(prisma.notification.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'fine-settled:301' },
      create: expect.objectContaining({
        userId: 7,
        template: NotificationTemplate.FINE_PAID,
        dedupeKey: 'fine-settled:301',
      }),
      update: {},
    });
  });

  it('catches and swallows database errors without throwing', async () => {
    prisma.notification.upsert.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    // Must NOT throw
    await expect(
      subscriber.handleUserEvent({
        eventName: DOMAIN_EVENT_NAMES.USER_REGISTERED,
        userId: 8,
        email: 'user@example.com',
        name: 'Test User',
      }),
    ).resolves.toBeUndefined();
  });
});
