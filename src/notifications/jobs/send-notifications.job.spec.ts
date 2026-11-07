import { SendNotificationsJob } from './send-notifications.job';
import { FakeEmailProvider } from '../providers/fake-email.provider';
import { TokenBucketRateLimiter } from '../rate-limiter/token-bucket.rate-limiter';
import {
  PermanentEmailError,
  TransientEmailError,
} from '../providers/email-provider.interface';
import { NotificationTemplate } from '../notification.types';

describe('SendNotificationsJob (Unit Tests with FakeEmailProvider)', () => {
  let job: SendNotificationsJob;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let identityApi: {
    getMembersByIds: jest.Mock;
  };
  let catalogApi: {
    findTitlesByIds: jest.Mock;
  };
  let fakeEmailProvider: FakeEmailProvider;
  let rateLimiter: TokenBucketRateLimiter;
  const mockNow = new Date('2026-11-10T12:00:00.000Z');

  const mockContext = {
    clock: { now: () => mockNow },
    batchSize: 20,
    maxRunSeconds: 50,
    renewLease: jest.fn().mockResolvedValue(undefined),
    isAborted: jest.fn().mockReturnValue(false),
    timeRemainingMs: jest.fn().mockReturnValue(30000),
  };

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn(),
    };

    identityApi = {
      getMembersByIds: jest.fn().mockResolvedValue([
        {
          id: 42,
          name: 'John Doe',
          email: 'john@example.com',
          role: 'MEMBER',
        },
      ]),
    };

    catalogApi = {
      findTitlesByIds: jest
        .fn()
        .mockResolvedValue(new Map([[101, 'Domain-Driven Design']])),
    };

    fakeEmailProvider = new FakeEmailProvider();
    rateLimiter = new TokenBucketRateLimiter({
      maxPerSecond: 100, // fast in tests
      capacity: 100,
    });

    job = new SendNotificationsJob(
      prisma as any,
      identityApi as any,
      catalogApi as any,
      fakeEmailProvider,
      rateLimiter,
    );
  });

  it('delivers pending notification successfully and transitions to SENT', async () => {
    // 1st sweep returns 1 claimed row, 2nd sweep returns 0 (loop terminates)
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 1,
          userId: 42,
          template: NotificationTemplate.HOLD_CONFIRMED,
          dedupeKey: 'hold-confirmed:1',
          payload: { bookId: 101, holdId: 1 },
          attempts: 0,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const stats = await job.run(mockContext as any);

    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(0);
    expect(fakeEmailProvider.getSentEmails()).toHaveLength(1);
    expect(fakeEmailProvider.getSentEmails()[0].to).toBe('john@example.com');
    expect(fakeEmailProvider.getSentEmails()[0].subject).toBe(
      'Hold Confirmed: Domain-Driven Design',
    );
  });

  it('retries transient failure with backoff without marking FAILED', async () => {
    fakeEmailProvider.simulateNextFailure(
      new TransientEmailError('Network timeout to SMTP server'),
    );

    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 2,
          userId: 42,
          template: NotificationTemplate.LOAN_DUE_SOON,
          dedupeKey: 'loan-due-soon:2',
          payload: { bookId: 101, loanId: 2 },
          attempts: 0,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const stats = await job.run(mockContext as any);

    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(1);
    expect(fakeEmailProvider.getSentEmails()).toHaveLength(0);
  });

  it('immediately transitions row to FAILED on permanent error', async () => {
    fakeEmailProvider.simulateNextFailure(
      new PermanentEmailError('Mailbox does not exist'),
    );

    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 3,
          userId: 42,
          template: NotificationTemplate.WELCOME,
          dedupeKey: 'welcome:42',
          payload: {},
          attempts: 0,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const stats = await job.run(mockContext as any);

    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(1);
  });

  it('marks row as FAILED if recipient member does not exist in Identity', async () => {
    identityApi.getMembersByIds.mockResolvedValueOnce([]);

    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 4,
          userId: 999, // Unknown user
          template: NotificationTemplate.WELCOME,
          dedupeKey: 'welcome:999',
          payload: {},
          attempts: 0,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const stats = await job.run(mockContext as any);

    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(1);
    expect(fakeEmailProvider.getSentEmails()).toHaveLength(0);
  });
});

