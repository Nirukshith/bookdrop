import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { SendRemindersJob } from './send-reminders.job';
import { PrismaService } from '../../../prisma/prisma.service';
import { FakeClockService } from '../../../common/clock';
import { LoanDueSoonEvent, LoanOverdueEvent } from '../../loans/events';
import { HoldExpiringSoonEvent } from '../../holds/events';
import { JobContext } from '../job.types';

describe('SendRemindersJob (Unit Tests)', () => {
  let job: SendRemindersJob;
  let prismaMock: any;
  let configServiceMock: any;
  let eventEmitterMock: any;
  let fakeClock: FakeClockService;

  const now = new Date('2026-11-06T12:00:00.000Z');

  beforeEach(async () => {
    fakeClock = new FakeClockService(now);

    configServiceMock = {
      get: jest.fn().mockReturnValue('UTC'),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    prismaMock = {
      $transaction: jest.fn((cb) => cb(prismaMock)),
      $executeRaw: jest.fn(),
      loan: {
        findMany: jest.fn(),
      },
      hold: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendRemindersJob,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    job = module.get<SendRemindersJob>(SendRemindersJob);
  });

  it('has correct name and 900-second (15-minute) interval', () => {
    expect(job.name).toBe('send-reminders');
    expect(job.intervalSeconds).toBe(900);
  });

  it('processes Sweep 1: emits loan.due_soon once when new ReminderMark is inserted', async () => {
    const dueAt = new Date('2026-11-07T12:00:00.000Z'); // 24 hours in future (within 48h)
    const mockLoan = { id: 1, userId: 10, bookId: 2, dueAt };

    // Sweep 1 findMany returns candidate then empty
    prismaMock.loan.findMany
      .mockResolvedValueOnce([mockLoan])
      .mockResolvedValueOnce([]) // Sweep 1 second batch empty
      .mockResolvedValueOnce([]) // Sweep 2 overdue empty
      .mockResolvedValueOnce([]); // Sweep 2 second batch empty

    prismaMock.hold.findMany.mockResolvedValue([]); // Sweep 3 empty

    // ReminderMark insert succeeds (1 row inserted)
    prismaMock.$executeRaw.mockResolvedValue(1);

    const context: JobContext = {
      clock: fakeClock as any,
      batchSize: 100,
      maxRunSeconds: 50,
      renewLease: jest.fn().mockResolvedValue(undefined),
      isAborted: () => false,
      timeRemainingMs: () => 50000,
    };

    const stats = await job.run(context);

    expect(stats.dueSoonReminders).toBe(1);
    expect(stats.eventsEmitted).toBe(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      LoanDueSoonEvent.EVENT_NAME,
      expect.objectContaining({
        loanId: 1,
        userId: 10,
        bookId: 2,
        dueAt,
      }),
    );
  });

  it('does not emit loan.due_soon if ReminderMark already exists (idempotency)', async () => {
    const dueAt = new Date('2026-11-07T12:00:00.000Z');
    const mockLoan = { id: 1, userId: 10, bookId: 2, dueAt };

    prismaMock.loan.findMany
      .mockResolvedValueOnce([mockLoan])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.hold.findMany.mockResolvedValue([]);

    // Conflict: 0 rows inserted
    prismaMock.$executeRaw.mockResolvedValue(0);

    const context: JobContext = {
      clock: fakeClock as any,
      batchSize: 100,
      maxRunSeconds: 50,
      renewLease: jest.fn().mockResolvedValue(undefined),
      isAborted: () => false,
      timeRemainingMs: () => 50000,
    };

    const stats = await job.run(context);

    expect(stats.dueSoonReminders).toBe(0);
    expect(stats.eventsEmitted).toBe(0);
    expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
      LoanDueSoonEvent.EVENT_NAME,
      expect.anything(),
    );
  });

  it('processes Sweep 2: emits loan.overdue with daysLate, and never emits due_soon for overdue loans', async () => {
    const pastDueAt = new Date('2026-11-04T12:00:00.000Z'); // 2 days ago
    const mockOverdueLoan = { id: 2, userId: 15, bookId: 3, dueAt: pastDueAt };

    // Sweep 1 returns empty
    prismaMock.loan.findMany
      .mockResolvedValueOnce([]) // Sweep 1 empty
      .mockResolvedValueOnce([mockOverdueLoan]) // Sweep 2 overdue returns 1
      .mockResolvedValueOnce([]); // Sweep 2 second batch empty

    prismaMock.hold.findMany.mockResolvedValue([]); // Sweep 3 empty

    prismaMock.$executeRaw.mockResolvedValue(1);

    const context: JobContext = {
      clock: fakeClock as any,
      batchSize: 100,
      maxRunSeconds: 50,
      renewLease: jest.fn().mockResolvedValue(undefined),
      isAborted: () => false,
      timeRemainingMs: () => 50000,
    };

    const stats = await job.run(context);

    expect(stats.overdueReminders).toBe(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      LoanOverdueEvent.EVENT_NAME,
      expect.objectContaining({
        loanId: 2,
        userId: 15,
        bookId: 3,
        dueAt: pastDueAt,
        daysLate: 2,
      }),
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
      LoanDueSoonEvent.EVENT_NAME,
      expect.anything(),
    );
  });

  it('processes Sweep 3: emits hold.expiring_soon once for active hold within 6 hours', async () => {
    const expiresAt = new Date('2026-11-06T15:00:00.000Z'); // 3 hours in future (within 6h)
    const mockHold = { id: 50, userId: 20, bookId: 4, expiresAt };

    prismaMock.loan.findMany
      .mockResolvedValueOnce([]) // Sweep 1
      .mockResolvedValueOnce([]); // Sweep 2

    prismaMock.hold.findMany
      .mockResolvedValueOnce([mockHold])
      .mockResolvedValueOnce([]); // Sweep 3 second batch empty

    prismaMock.$executeRaw.mockResolvedValue(1);

    const context: JobContext = {
      clock: fakeClock as any,
      batchSize: 100,
      maxRunSeconds: 50,
      renewLease: jest.fn().mockResolvedValue(undefined),
      isAborted: () => false,
      timeRemainingMs: () => 50000,
    };

    const stats = await job.run(context);

    expect(stats.holdExpiringReminders).toBe(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      HoldExpiringSoonEvent.EVENT_NAME,
      expect.objectContaining({
        holdId: 50,
        userId: 20,
        bookId: 4,
        expiresAt,
      }),
    );
  });
});
