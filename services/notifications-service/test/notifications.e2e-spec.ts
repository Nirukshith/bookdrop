process.env.NODE_ENV = 'test';
process.env.NOTIFICATION_RATE_LIMIT_RPS = '100';
process.env.NOTIFICATION_BURST_CAPACITY = '100';
process.env.SCHEDULER_ENABLED = 'false';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationStatus, NotificationTemplate } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SendNotificationsJob } from '../src/jobs/send-notifications.job';

describe('Notifications Microservice E2E', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let prisma: PrismaService;
  let worker: SendNotificationsJob;
  const rabbitmqUrl =
    process.env.RABBITMQ_URL || 'amqp://bookdrop:bookdrop@localhost:5672';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    worker = app.get(SendNotificationsJob);

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'bookdrop.notifications',
        noAck: false,
        queueOptions: {
          durable: true,
        },
      },
    });

    await app.startAllMicroservices();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should successfully boot the microservice and process pending notification outbox rows', async () => {
    const testLoanId = Math.floor(Math.random() * 1000000) + 50000;
    const dedupeKey = `microservice-e2e:${testLoanId}`;

    // Seed a pending notification directly into the table
    const notification = await prisma.notification.create({
      data: {
        userId: 9999,
        template: NotificationTemplate.LOAN_STARTED,
        dedupeKey,
        payload: {
          loanId: testLoanId,
          userEmail: 'microservice_test@example.com',
          userName: 'Microservice Tester',
          bookTitle: 'Enterprise Microservices',
          dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        status: NotificationStatus.PENDING,
        nextAttemptAt: new Date(),
      },
    });

    expect(notification.status).toBe(NotificationStatus.PENDING);

    // Run sweep
    const stats = await worker.run({
      clock: { now: () => new Date() },
      batchSize: 10,
      maxRunSeconds: 10,
      renewLease: async () => {},
      isAborted: () => false,
      timeRemainingMs: () => 10000,
    });

    expect(stats.processed).toBeGreaterThanOrEqual(1);

    const updated = await prisma.notification.findUnique({
      where: { dedupeKey },
    });

    expect(updated?.status).toBe(NotificationStatus.SENT);
    expect(updated?.sentAt).not.toBeNull();

    // Clean up
    await prisma.notification.delete({
      where: { dedupeKey },
    });
  });
});
