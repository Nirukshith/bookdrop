import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationStatus, NotificationTemplate } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RabbitMQPublisherService } from '../src/common/messaging/rabbitmq-publisher.service';
import { BOOKDROP_NOTIFICATIONS_QUEUE } from '../src/common/messaging/messaging.constants';

describe('Stage 11: RabbitMQ Messaging E2E Integration', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let prisma: PrismaService;
  let publisher: RabbitMQPublisherService;
  let testUserId: number;

  const testPrefix = `st11_${Date.now()}`;
  const rabbitmqUrl =
    process.env.RABBITMQ_URL || 'amqp://bookdrop:bookdrop@localhost:5672';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    publisher = app.get(RabbitMQPublisherService);

    // Connect to RabbitMQ microservice listener
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: BOOKDROP_NOTIFICATIONS_QUEUE,
        noAck: false,
        queueOptions: {
          durable: true,
        },
      },
    });

    await app.startAllMicroservices();
    await app.init();

    // Create a dedicated test user for notification tests
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}_user@example.com`,
        name: 'RabbitMQ Test User',
        passwordHash: 'dummy_hash_for_test',
        role: 'MEMBER',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup notifications and test user
    if (testUserId) {
      await prisma.notification.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }

    await app.close();
  });

  it('should publish a domain event to RabbitMQ and have NotificationsConsumer enqueue it in the database', async () => {
    const loanId = Math.floor(Math.random() * 1000000) + 1000;
    const dedupeKey = `loan-started:${loanId}`;
    const eventPayload = {
      eventName: 'loan.started',
      loanId,
      userId: testUserId,
      bookId: 101,
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // Publish event through RabbitMQ publisher
    await publisher.publish('loan.started', eventPayload);

    // Poll database for up to 5 seconds to verify consumer enqueued the notification
    let notification = null;
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      notification = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(notification).not.toBeNull();
    expect(notification?.userId).toBe(testUserId);
    expect(notification?.template).toBe(NotificationTemplate.LOAN_STARTED);
    expect(notification?.status).toBe(NotificationStatus.PENDING);
  });

  it('should guarantee idempotency when duplicate events arrive through RabbitMQ', async () => {
    const dedupeKey = `welcome:${testUserId}`;
    const eventPayload = {
      eventName: 'user.registered',
      userId: testUserId,
      email: `${testPrefix}_user@example.com`,
      name: 'RabbitMQ Test User',
    };

    // Publish event twice in rapid succession
    await publisher.publish('user.registered', eventPayload);
    await publisher.publish('user.registered', eventPayload);

    // Wait for consumer to process
    let notifications: any[] = [];
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      notifications = await prisma.notification.findMany({
        where: { dedupeKey },
      });
      if (notifications.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Strictly 1 notification must exist due to idempotent upsert
    expect(notifications).toHaveLength(1);
    expect(notifications[0].template).toBe(NotificationTemplate.WELCOME);
  });
});
