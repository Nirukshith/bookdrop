import { INestApplication, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationStatus, NotificationTemplate, Role } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { JobRunnerService } from '../src/circulation/jobs/job-runner.service';
import { ClockService, FakeClockService } from '../src/common/clock';
import { DOMAIN_EVENT_NAMES } from '../src/contracts/events';
import {
  PermanentEmailError,
  TransientEmailError,
} from '../src/notifications/providers/email-provider.interface';
import { FakeEmailProvider } from '../src/notifications/providers/fake-email.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

describe('Stage 10: Notifications (Email) E2E Integration', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let jobRunner: JobRunnerService;
  let fakeClock: FakeClockService;
  let fakeEmailProvider: FakeEmailProvider;
  let eventEmitter: EventEmitter2;

  let memberUser: { id: number; email: string };

  let memberToken: string;
  let librarianToken: string;
  let adminToken: string;
  let testBookId: number;

  const testPrefix = `st10_${Date.now()}`;

  beforeAll(async () => {
    fakeClock = new FakeClockService('2026-11-10T10:00:00.000Z');
    fakeEmailProvider = new FakeEmailProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClockService)
      .useValue(fakeClock)
      .overrideProvider('EMAIL_PROVIDER')
      .useValue(fakeEmailProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    usersService = app.get<UsersService>(UsersService);
    authService = app.get<AuthService>(AuthService);
    jobRunner = app.get<JobRunnerService>(JobRunnerService);
    eventEmitter = app.get<EventEmitter2>(EventEmitter2);

    // Clean up job leases and notifications from any previous runs
    await prisma.jobLease.deleteMany();
    await prisma.notification.deleteMany();

    // Create a test book
    const author = await prisma.author.create({
      data: { name: `Author ${testPrefix}` },
    });
    const category = await prisma.category.create({
      data: { name: `Category ${testPrefix}` },
    });
    const book = await prisma.book.create({
      data: {
        title: `Designing Data-Intensive Systems (${testPrefix})`,
        isbn: `978-${Date.now().toString().slice(-10)}`,
        publishedYear: 2026,
        authors: { connect: [{ id: author.id }] },
        categories: { connect: [{ id: category.id }] },
      },
    });
    testBookId = book.id;

    // Create test accounts
    const memberEmail = `${testPrefix}_member@example.com`;
    const librarianEmail = `${testPrefix}_librarian@example.com`;
    const adminEmail = `${testPrefix}_admin@example.com`;

    memberUser = await usersService.create({
      name: 'E2E Notification Member',
      email: memberEmail,
      password: 'Password123!',
      role: Role.MEMBER,
    });

    await usersService.create({
      name: 'E2E Notification Librarian',
      email: librarianEmail,
      password: 'Password123!',
      role: Role.LIBRARIAN,
    });

    await usersService.create({
      name: 'E2E Notification Admin',
      email: adminEmail,
      password: 'Password123!',
      role: Role.ADMIN,
    });

    const mLogin = await authService.login({
      email: memberEmail,
      password: 'Password123!',
    });
    memberToken = mLogin.accessToken;

    const lLogin = await authService.login({
      email: librarianEmail,
      password: 'Password123!',
    });
    librarianToken = lLogin.accessToken;

    const aLogin = await authService.login({
      email: adminEmail,
      password: 'Password123!',
    });
    adminToken = aLogin.accessToken;
  });

  afterAll(async () => {
    await prisma.jobLease.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.book.deleteMany({
      where: { id: testBookId },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: { email: { contains: testPrefix } },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { contains: testPrefix },
      },
    });
    await app.close();
  });

  beforeEach(async () => {
    fakeEmailProvider.clear();
    await prisma.jobLease.deleteMany();
  });

  describe('1. Member Registration & Welcome Email', () => {
    it('enqueues a WELCOME notification on user registration and dispatches email via send-notifications job', async () => {
      const newEmail = `${testPrefix}_registered_${Date.now()}@example.com`;

      const regResult = await authService.register({
        name: 'New Registered User',
        email: newEmail,
        password: 'Password123!',
      });
      const newUserId = regResult.user.id;

      // Event listener asynchronously enqueues notification row
      let notifRow = await prisma.notification.findUnique({
        where: { dedupeKey: `welcome:${newUserId}` },
      });
      for (let i = 0; i < 20 && !notifRow; i++) {
        await new Promise((r) => setTimeout(r, 50));
        notifRow = await prisma.notification.findUnique({
          where: { dedupeKey: `welcome:${newUserId}` },
        });
      }

      expect(notifRow).toBeDefined();
      expect(notifRow?.status).toBe(NotificationStatus.PENDING);
      expect(notifRow?.template).toBe(NotificationTemplate.WELCOME);
      expect(notifRow?.userId).toBe(newUserId);

      // Run send-notifications job
      const jobResult = await jobRunner.runOnce('send-notifications');
      expect(jobResult.status).toBe('COMPLETED');

      // Verify email was dispatched to FakeEmailProvider
      const sent = fakeEmailProvider.getSentEmails();
      expect(sent.length).toBeGreaterThanOrEqual(1);
      const welcomeEmail = sent.find((e) => e.to === newEmail);
      expect(welcomeEmail).toBeDefined();
      expect(welcomeEmail?.subject).toContain('Welcome to Bookdrop');
      expect(welcomeEmail?.html).toContain('New Registered User');

      // Verify database row status transitioned to SENT
      const updatedRow = await prisma.notification.findUnique({
        where: { dedupeKey: `welcome:${newUserId}` },
      });
      expect(updatedRow?.status).toBe(NotificationStatus.SENT);
      expect(updatedRow?.sentAt).toBeDefined();
    });
  });

  describe('2. Domain Events to Notifications & Idempotent Deduplication', () => {
    it('enqueues HOLD_CONFIRMED on hold.created and prevents duplicate entries on re-emission', async () => {
      const holdId = 99101;
      const dedupeKey = `hold-confirmed:${holdId}`;

      // Emit hold.created domain event
      await eventEmitter.emitAsync(DOMAIN_EVENT_NAMES.HOLD_CREATED, {
        eventName: DOMAIN_EVENT_NAMES.HOLD_CREATED,
        domain: 'hold',
        holdId,
        userId: memberUser.id,
        bookId: testBookId,
        source: 'REQUEST',
        expiresAt: new Date(fakeClock.now().getTime() + 48 * 3600 * 1000),
        occurredAt: fakeClock.now(),
      });

      const rowsAfterFirst = await prisma.notification.findMany({
        where: { dedupeKey },
      });
      expect(rowsAfterFirst.length).toBe(1);
      expect(rowsAfterFirst[0].template).toBe(
        NotificationTemplate.HOLD_CONFIRMED,
      );

      // Emit again (idempotency check)
      await eventEmitter.emitAsync(DOMAIN_EVENT_NAMES.HOLD_CREATED, {
        eventName: DOMAIN_EVENT_NAMES.HOLD_CREATED,
        domain: 'hold',
        holdId,
        userId: memberUser.id,
        bookId: testBookId,
        source: 'REQUEST',
        expiresAt: new Date(fakeClock.now().getTime() + 48 * 3600 * 1000),
        occurredAt: fakeClock.now(),
      });

      const rowsAfterSecond = await prisma.notification.findMany({
        where: { dedupeKey },
      });
      expect(rowsAfterSecond.length).toBe(1);

      // Run send-notifications job
      await jobRunner.runOnce('send-notifications');

      const updatedRow = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      expect(updatedRow?.status).toBe(NotificationStatus.SENT);

      const sent = fakeEmailProvider.getSentEmails();
      const holdEmail = sent.find((e) => e.to === memberUser.email);
      expect(holdEmail).toBeDefined();
      expect(holdEmail?.subject).toContain('Hold Confirmed');
      expect(holdEmail?.html).toContain('Designing Data-Intensive Systems');
    });
  });

  describe('3. Stale Notification Drop (validUntil)', () => {
    it('transitions notifications past validUntil directly to CANCELLED without sending email', async () => {
      const pastHoldId = 88102;
      const dedupeKey = `hold-expiring:${pastHoldId}`;

      // Insert an expired notification directly
      await prisma.notification.create({
        data: {
          userId: memberUser.id,
          template: NotificationTemplate.HOLD_EXPIRING_SOON,
          dedupeKey,
          payload: { holdId: pastHoldId, bookId: testBookId },
          status: NotificationStatus.PENDING,
          validUntil: new Date(fakeClock.now().getTime() - 10000), // in the past
          nextAttemptAt: fakeClock.now(),
        },
      });

      // Run send job
      await jobRunner.runOnce('send-notifications');

      const row = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      expect(row?.status).toBe(NotificationStatus.CANCELLED);
      expect(row?.sentAt).toBeNull();

      // Ensure no email was sent
      const sent = fakeEmailProvider.getSentEmails();
      expect(sent.some((e) => e.subject.includes('Hold Expiring Soon'))).toBe(
        false,
      );
    });
  });

  describe('4. Transient Failure & Exponential Backoff', () => {
    it('retries transient errors with backoff and delivers once recovered', async () => {
      const loanId = 77103;
      const dedupeKey = `loan-started:${loanId}`;

      await prisma.notification.create({
        data: {
          userId: memberUser.id,
          template: NotificationTemplate.LOAN_STARTED,
          dedupeKey,
          payload: {
            loanId,
            bookId: testBookId,
            dueAt: new Date(fakeClock.now().getTime() + 14 * 86400 * 1000),
          },
          status: NotificationStatus.PENDING,
          nextAttemptAt: fakeClock.now(),
        },
      });

      // Simulate a transient network error on the first attempt
      fakeEmailProvider.simulateNextFailure(
        new TransientEmailError('SES Throttling: 429 Too Many Requests'),
      );

      await jobRunner.runOnce('send-notifications');

      const afterFailedAttempt = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      expect(afterFailedAttempt?.status).toBe(NotificationStatus.PENDING);
      expect(afterFailedAttempt?.attempts).toBe(1);
      expect(afterFailedAttempt?.lastError).toContain('SES Throttling');
      expect(afterFailedAttempt!.nextAttemptAt.getTime()).toBeGreaterThan(
        fakeClock.now().getTime(),
      );

      // An immediate second run should skip this notification because nextAttemptAt is in the future
      await jobRunner.runOnce('send-notifications');
      expect(fakeEmailProvider.getSentEmails().length).toBe(0);

      // Advance clock past the backoff interval (30s + jitter)
      fakeClock.advanceMs(60 * 1000);

      // Now run again - it should succeed
      await jobRunner.runOnce('send-notifications');

      const afterRecovery = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      expect(afterRecovery?.status).toBe(NotificationStatus.SENT);
      expect(afterRecovery?.sentAt).toBeDefined();
      expect(fakeEmailProvider.getSentEmails().length).toBe(1);
    });
  });

  describe('5. Permanent Failure', () => {
    it('transitions directly to FAILED without retries when provider throws PermanentEmailError', async () => {
      const fineId = 66104;
      const dedupeKey = `fine-assessed:${fineId}`;

      await prisma.notification.create({
        data: {
          userId: memberUser.id,
          template: NotificationTemplate.FINE_ASSESSED,
          dedupeKey,
          payload: {
            fineId,
            reason: 'OVERDUE_RETURNS',
            amountRs: 50,
            bookId: testBookId,
          },
          status: NotificationStatus.PENDING,
          nextAttemptAt: fakeClock.now(),
        },
      });

      fakeEmailProvider.simulateNextFailure(
        new PermanentEmailError('Email address bounce (550 Unknown Recipient)'),
      );

      await jobRunner.runOnce('send-notifications');

      const row = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      expect(row?.status).toBe(NotificationStatus.FAILED);
      expect(row?.attempts).toBe(1);
      expect(row?.lastError).toContain('550 Unknown Recipient');
    });
  });

  describe('6. GraphQL Queries & Admin retryNotification Mutation', () => {
    it('allows a member to view their notifications via myNotifications', async () => {
      const query = `
        query {
          myNotifications {
            id
            template
            status
            createdAt
            sentAt
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ query });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      const notifs = res.body.data.myNotifications;
      expect(Array.isArray(notifs)).toBe(true);
      expect(notifs.length).toBeGreaterThan(0);
      // Ensure private fields like payload, dedupeKey, tokens are not returned
      expect(notifs[0]).toHaveProperty('id');
      expect(notifs[0]).toHaveProperty('template');
      expect(notifs[0]).toHaveProperty('status');
      expect(notifs[0]).not.toHaveProperty('payload');
      expect(notifs[0]).not.toHaveProperty('dedupeKey');
    });

    it('allows staff to view member notifications and forbids regular members', async () => {
      const query = `
        query($email: String!) {
          memberNotifications(memberEmail: $email) {
            id
            template
            status
          }
        }
      `;

      // 1. Staff query (Librarian) -> 200 OK
      const staffRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({ query, variables: { email: memberUser.email } });

      expect(staffRes.status).toBe(200);
      expect(staffRes.body.errors).toBeUndefined();
      expect(staffRes.body.data.memberNotifications.length).toBeGreaterThan(0);

      // 2. Member query -> 403 / Access denied
      const memberRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ query, variables: { email: memberUser.email } });

      expect(memberRes.body.errors).toBeDefined();
      expect(memberRes.body.errors[0].message).toContain('Access denied');
    });

    it('allows admin to retry a FAILED notification, resetting it to PENDING for delivery', async () => {
      // Find the FAILED notification from previous test
      const failedNotif = await prisma.notification.findFirst({
        where: {
          userId: memberUser.id,
          status: NotificationStatus.FAILED,
        },
      });
      expect(failedNotif).toBeDefined();

      const mutation = `
        mutation($id: Int!) {
          retryNotification(id: $id) {
            id
            status
          }
        }
      `;

      // 1. Member tries -> Access denied
      const memberRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ query: mutation, variables: { id: failedNotif!.id } });
      expect(memberRes.body.errors).toBeDefined();
      expect(memberRes.body.errors[0].message).toContain('Access denied');

      // 2. Admin retries -> Success
      const adminRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: mutation, variables: { id: failedNotif!.id } });

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.errors).toBeUndefined();
      expect(adminRes.body.data.retryNotification.status).toBe('PENDING');

      const recheckedRow = await prisma.notification.findUnique({
        where: { id: failedNotif!.id },
      });
      expect(recheckedRow?.status).toBe(NotificationStatus.PENDING);
      expect(recheckedRow?.attempts).toBe(0);
      expect(recheckedRow?.lastError).toBeNull();

      // Run send-notifications job to verify it now delivers
      await jobRunner.runOnce('send-notifications');

      const deliveredRow = await prisma.notification.findUnique({
        where: { id: failedNotif!.id },
      });
      expect(deliveredRow?.status).toBe(NotificationStatus.SENT);
      expect(deliveredRow?.sentAt).toBeDefined();
    });
  });
});
