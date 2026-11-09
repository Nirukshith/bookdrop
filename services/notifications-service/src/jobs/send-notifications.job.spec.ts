import { SendNotificationsJob } from './send-notifications.job';
import { FakeEmailProvider } from '../providers/fake-email.provider';
import { TokenBucketRateLimiter } from '../rate-limiter/token-bucket.rate-limiter';
import {
  PermanentEmailError,
  TransientEmailError,
} from '../providers/email-provider.interface';
import { NotificationTemplate } from '../notification.types';

describe('SendNotificationsJob (Unit Tests in Microservice)', () => {
  let job: SendNotificationsJob;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
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

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'SCHEDULER_ENABLED') return true;
        if (key === 'EMAIL_FROM') return 'Bookdrop Library <no-reply@bookdrop.io>';
        return defaultValue;
      }),
    };

    fakeEmailProvider = new FakeEmailProvider();
    rateLimiter = new TokenBucketRateLimiter({
      maxPerSecond: 100,
      capacity: 100,
    });

    job = new SendNotificationsJob(
      prisma as any,
      fakeEmailProvider,
      rateLimiter,
      configService as any,
    );
  });

  it('delivers pending notification successfully and transitions to SENT', async () => {
    // 1st query returns 1 claimed row, 2nd query returns 0 (loop terminates)
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 1,
          userId: 42,
          template: NotificationTemplate.HOLD_CONFIRMED,
          dedupeKey: 'hold-confirmed:1',
          payload: {
            holdId: 1,
            bookId: 101,
            userEmail: 'john@example.com',
            userName: 'John Doe',
            bookTitle: 'Domain-Driven Design',
          },
          attempts: 0,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const stats = await job.run(mockContext);

    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(0);
    const sent = fakeEmailProvider.getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('john@example.com');
    expect(sent[0].subject).toContain('Hold Confirmed');

    // Verify raw query updated row to SENT
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('marks row FAILED immediately when email provider throws PermanentEmailError', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 2,
          userId: 42,
          template: NotificationTemplate.WELCOME,
          dedupeKey: 'welcome:42',
          payload: {
            userEmail: 'invalid@bounce.com',
            userName: 'Invalid User',
          },
          attempts: 0,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    fakeEmailProvider.simulateNextFailure(
      new PermanentEmailError('Mailbox does not exist'),
    );

    const stats = await job.run(mockContext);

    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(1);
    expect(fakeEmailProvider.getSentEmails()).toHaveLength(0);
  });

  it('reschedules row with backoff when email provider throws TransientEmailError', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 3,
          userId: 42,
          template: NotificationTemplate.WELCOME,
          dedupeKey: 'welcome:42',
          payload: {
            userEmail: 'john@example.com',
            userName: 'John Doe',
          },
          attempts: 1,
          validUntil: null,
        },
      ])
      .mockResolvedValueOnce([]);

    fakeEmailProvider.simulateNextFailure(
      new TransientEmailError('Connection timed out'),
    );

    const stats = await job.run(mockContext);

    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(1);
  });
});
