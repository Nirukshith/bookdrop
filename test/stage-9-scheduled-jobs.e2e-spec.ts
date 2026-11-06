import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyStatus,
  FineReason,
  FineStatus,
  HoldSource,
  HoldStatus,
  LoanStatus,
  ReminderKind,
  ReservationStatus,
  Role,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClockService, FakeClockService } from '../src/common/clock';
import { HoldsService } from '../src/circulation/holds/holds.service';
import { LoansService } from '../src/circulation/loans/loans.service';
import { JobRunnerService } from '../src/circulation/jobs/job-runner.service';
import { withTransactionRetry } from '../src/common/database';
import {
  MISSED_PICKUP_FINE_RS,
  MISSED_PICKUPS_BEFORE_FINE,
  rsToMinor,
  selectMissedPickupsToAssess,
} from '../src/config/library-rules';

const INTERACTIVE_TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

describe('Stage 9 Scheduled Jobs, Missed Pickups, and Reminders (E2E Integration & Concurrency)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let prisma: PrismaService;
  let fakeClock: FakeClockService;
  let holdsService: HoldsService;
  let loansService: LoansService;
  let jobRunner: JobRunnerService;
  let eventEmitter: EventEmitter2;

  const testRunId = `st9_${Date.now()}`;
  let staffUser: { id: number; email: string };
  let authorId: number;
  let categoryId: number;

  beforeAll(async () => {
    fakeClock = new FakeClockService('2026-11-10T10:00:00.000Z');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClockService)
      .useValue(fakeClock)
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
    fakeClock = app.get(ClockService) as FakeClockService;
    holdsService = app.get<HoldsService>(HoldsService);
    loansService = app.get<LoansService>(LoansService);
    jobRunner = app.get<JobRunnerService>(JobRunnerService);
    eventEmitter = app.get<EventEmitter2>(EventEmitter2);

    // Clean up any stale job leases
    await prisma.jobLease.deleteMany();

    // Create shared staff user
    staffUser = await prisma.user.create({
      data: {
        email: `staff_${testRunId}@bookdrop.local`,
        name: 'Staff User',
        role: Role.LIBRARIAN,
        passwordHash: 'dummy-hash',
      },
    });

    const author = await prisma.author.create({
      data: { name: `Author ${testRunId}` },
    });
    authorId = author.id;

    const category = await prisma.category.create({
      data: { name: `Category ${testRunId}` },
    });
    categoryId = category.id;
  });

  beforeEach(async () => {
    // Reset leases before each test so runOnce can always acquire ownership
    await prisma.jobLease.deleteMany();
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { contains: testRunId } },
      select: { id: true },
    });
    const testUserIds = testUsers.map((u) => u.id);

    await prisma.jobLease.deleteMany();
    await prisma.reminderMark.deleteMany();
    await prisma.missedPickup.deleteMany();
    await prisma.finePayment.deleteMany({
      where: { fine: { userId: { in: testUserIds } } },
    });
    await prisma.fine.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.reservation.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.loan.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.hold.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.copyStatusHistory.deleteMany({
      where: { copy: { book: { title: { contains: testRunId } } } },
    });
    await prisma.copy.deleteMany({
      where: { book: { title: { contains: testRunId } } },
    });
    await prisma.book.deleteMany({
      where: { title: { contains: testRunId } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: testRunId } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.author.deleteMany({ where: { id: authorId } });
    await app.close();
  });

  // Helper to create a test member
  async function createMember(suffix: string) {
    return prisma.user.create({
      data: {
        email: `member_${testRunId}_${suffix}_${Math.random().toString(36).substring(7)}@bookdrop.local`,
        name: `Member ${suffix}`,
        role: Role.MEMBER,
        passwordHash: 'dummy-hash',
      },
    });
  }

  // Helper to create a test book with N copies
  async function createBookWithCopies(
    title: string,
    copiesCount: number,
    initialStatus: CopyStatus = CopyStatus.AVAILABLE,
  ) {
    const book = await prisma.book.create({
      data: {
        title: `${title} ${testRunId}_${Math.random().toString(36).substring(7)}`,
        isbn: `ISBN-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        priceMinor: 50000,
        publishedYear: 2026,
        authors: { connect: [{ id: authorId }] },
        categories: { connect: [{ id: categoryId }] },
      },
    });

    const copies = [];
    for (let i = 0; i < copiesCount; i++) {
      const barcode = `BD-${book.id}-${i + 1}-${Math.floor(Math.random() * 1000000)}`;
      const copy = await prisma.copy.create({
        data: {
          bookId: book.id,
          barcode,
          status: initialStatus,
          shelfLocation: 'ROW-1',
        },
      });
      copies.push(copy);
    }

    return { book, copies };
  }

  describe('1. Single Hold Expiration via expire-holds Job', () => {
    it('expires an overdue hold, frees the copy, records ONE missed pickup, and is idempotent on re-run', async () => {
      const member = await createMember('h_expire_single');
      const { book, copies } = await createBookWithCopies(
        'Single Expire',
        1,
        CopyStatus.ON_HOLD,
      );
      const copy = copies[0];

      // Create an ACTIVE hold whose deadline has already passed
      const pastDeadline = new Date(fakeClock.now().getTime() - 10 * 60 * 1000); // 10 min ago
      const hold = await prisma.hold.create({
        data: {
          userId: member.id,
          bookId: book.id,
          copyId: copy.id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: new Date(pastDeadline.getTime() - 24 * 60 * 60 * 1000),
          expiresAt: pastDeadline,
        },
      });

      // Capture emitted events
      const emittedEvents: string[] = [];
      const holdExpiredListener = () => emittedEvents.push('hold.expired');
      const missedPickupListener = () =>
        emittedEvents.push('missed_pickup.recorded');
      eventEmitter.on('hold.expired', holdExpiredListener);
      eventEmitter.on('missed_pickup.recorded', missedPickupListener);

      // Run expire-holds job through the runner
      const runResult = await jobRunner.runOnce('expire-holds');
      expect(runResult.status).toBe('COMPLETED');
      expect(runResult.stats?.processed).toBeGreaterThanOrEqual(1);

      // Verify hold status is EXPIRED
      const updatedHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(updatedHold.status).toBe(HoldStatus.EXPIRED);

      // Verify copy is freed to AVAILABLE
      const updatedCopy = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(updatedCopy.status).toBe(CopyStatus.AVAILABLE);

      // Verify exactly ONE MissedPickup record was created
      const missedPickups = await prisma.missedPickup.findMany({
        where: { holdId: hold.id },
      });
      expect(missedPickups).toHaveLength(1);
      expect(missedPickups[0].userId).toBe(member.id);
      expect(missedPickups[0].excused).toBe(false);
      expect(missedPickups[0].fineId).toBeNull();

      expect(emittedEvents).toContain('hold.expired');
      expect(emittedEvents).toContain('missed_pickup.recorded');

      eventEmitter.off('hold.expired', holdExpiredListener);
      eventEmitter.off('missed_pickup.recorded', missedPickupListener);

      // Re-run job immediately — verify idempotency
      await prisma.jobLease.deleteMany();
      const secondRun = await jobRunner.runOnce('expire-holds');
      expect(secondRun.status).toBe('COMPLETED');

      const missedPickupsAfter = await prisma.missedPickup.findMany({
        where: { holdId: hold.id },
      });
      expect(missedPickupsAfter).toHaveLength(1);
    });
  });

  describe('2. Missed Pickups Assessment & Thresholds', () => {
    it('assesses 1 fine of Rs 100 when 3 holds expire, and 2 fines when 6 expire; resets unassessed count to 0', async () => {
      const member = await createMember('three_strikes');

      // Create 6 separate books (1 copy each, initialized to ON_HOLD)
      const bookCopies = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          createBookWithCopies(`Strike Book ${i}`, 1, CopyStatus.ON_HOLD),
        ),
      );

      const past = new Date(fakeClock.now().getTime() - 15 * 60 * 1000);

      // Create 3 active holds
      const holdIds: number[] = [];
      for (let i = 0; i < 3; i++) {
        const { book, copies } = bookCopies[i];
        const h = await prisma.hold.create({
          data: {
            userId: member.id,
            bookId: book.id,
            copyId: copies[0].id,
            status: HoldStatus.ACTIVE,
            source: HoldSource.REQUEST,
            createdAt: new Date(past.getTime() - 24 * 60 * 60 * 1000),
            expiresAt: past,
          },
        });
        holdIds.push(h.id);
      }

      // Expire all 3 holds sequentially through holdsService
      for (const hid of holdIds) {
        await holdsService.expireHold(hid);
      }

      // Assert exactly 1 fine created
      const fines = await prisma.fine.findMany({
        where: { userId: member.id, reason: FineReason.MISSED_PICKUPS },
      });
      expect(fines).toHaveLength(1);
      expect(fines[0].amountMinor).toBe(rsToMinor(MISSED_PICKUP_FINE_RS)); // 10000 paise = Rs 100
      expect(fines[0].status).toBe(FineStatus.UNPAID);

      // All 3 missed pickups must be assessed
      const pickups = await prisma.missedPickup.findMany({
        where: { userId: member.id },
      });
      expect(pickups).toHaveLength(3);
      for (const p of pickups) {
        expect(p.fineId).toBe(fines[0].id);
      }

      // Unassessed count resets to zero
      const unassessedCount = await prisma.missedPickup.count({
        where: { userId: member.id, fineId: null, excused: false },
      });
      expect(unassessedCount).toBe(0);

      // Create 3 more active holds on remaining 3 books
      const holdIdsBatch2: number[] = [];
      for (let i = 3; i < 6; i++) {
        const { book, copies } = bookCopies[i];
        const h = await prisma.hold.create({
          data: {
            userId: member.id,
            bookId: book.id,
            copyId: copies[0].id,
            status: HoldStatus.ACTIVE,
            source: HoldSource.REQUEST,
            createdAt: new Date(past.getTime() - 24 * 60 * 60 * 1000),
            expiresAt: past,
          },
        });
        holdIdsBatch2.push(h.id);
      }

      for (const hid of holdIdsBatch2) {
        await holdsService.expireHold(hid);
      }

      // Total of 2 fines created now
      const allFines = await prisma.fine.findMany({
        where: { userId: member.id, reason: FineReason.MISSED_PICKUPS },
      });
      expect(allFines).toHaveLength(2);

      const allPickups = await prisma.missedPickup.findMany({
        where: { userId: member.id },
      });
      expect(allPickups).toHaveLength(6);
      for (const p of allPickups) {
        expect(p.fineId).not.toBeNull();
      }

      const finalUnassessed = await prisma.missedPickup.count({
        where: { userId: member.id, fineId: null, excused: false },
      });
      expect(finalUnassessed).toBe(0);
    });
  });

  describe('3. Non-Expiring Holds Never Count as Missed Pickups', () => {
    it('never creates missed pickups for cancelled or fulfilled holds', async () => {
      const member = await createMember('cancel_and_fulfill');
      const { book: book1, copies: copies1 } = await createBookWithCopies(
        'Safe Holds 1',
        1,
        CopyStatus.ON_HOLD,
      );
      const { book: book2, copies: copies2 } = await createBookWithCopies(
        'Safe Holds 2',
        1,
        CopyStatus.ON_HOLD,
      );

      // Hold 1: Cancelled by member
      const h1 = await prisma.hold.create({
        data: {
          userId: member.id,
          bookId: book1.id,
          copyId: copies1[0].id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: new Date(fakeClock.now().getTime() - 3600000),
          expiresAt: new Date(fakeClock.now().getTime() + 3600000),
        },
      });

      await holdsService.cancelHold(h1.id, {
        id: member.id,
        role: Role.MEMBER,
      });

      // Hold 2: Fulfilled into a loan
      const h2 = await prisma.hold.create({
        data: {
          userId: member.id,
          bookId: book2.id,
          copyId: copies2[0].id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: new Date(fakeClock.now().getTime() - 3600000),
          expiresAt: new Date(fakeClock.now().getTime() + 3600000),
        },
      });

      await loansService.confirmPickup(h2.id, copies2[0].barcode, staffUser.id);

      // Advance clock past initial deadlines and run expire job
      fakeClock.advanceMs(4 * 3600000);
      await jobRunner.runOnce('expire-holds');

      // Neither hold has a MissedPickup
      const missedPickups = await prisma.missedPickup.findMany({
        where: { holdId: { in: [h1.id, h2.id] } },
      });
      expect(missedPickups).toHaveLength(0);
    });
  });

  describe('4. Promoted Queue Holds Expiry & Reservation Promotion', () => {
    it('records missed pickup for expired queue promotion hold and automatically promotes next reservation', async () => {
      const member1 = await createMember('promoted_member1');
      const member2 = await createMember('waiting_member2');
      const { book, copies } = await createBookWithCopies(
        'Queue Promo',
        1,
        CopyStatus.ON_HOLD,
      );
      const copy = copies[0];

      // Member 1 has an active hold from queue promotion
      const past = new Date(fakeClock.now().getTime() - 1000);
      const hold1 = await prisma.hold.create({
        data: {
          userId: member1.id,
          bookId: book.id,
          copyId: copy.id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.QUEUE_PROMOTION,
          createdAt: new Date(past.getTime() - 24 * 3600000),
          expiresAt: past,
        },
      });

      // Member 2 is WAITING in the reservation queue
      const res2 = await prisma.reservation.create({
        data: {
          userId: member2.id,
          bookId: book.id,
          status: ReservationStatus.WAITING,
          createdAt: new Date(past.getTime() - 12 * 3600000),
        },
      });

      // Expire Member 1's hold
      const expiredHold = await holdsService.expireHold(hold1.id);
      expect(expiredHold).not.toBeNull();
      expect(expiredHold?.status).toBe(HoldStatus.EXPIRED);

      // Member 1 must receive a MissedPickup record
      const member1Pickup = await prisma.missedPickup.findUnique({
        where: { holdId: hold1.id },
      });
      expect(member1Pickup).not.toBeNull();
      expect(member1Pickup?.userId).toBe(member1.id);

      // Member 2's reservation must be automatically PROMOTED
      const updatedRes2 = await prisma.reservation.findUniqueOrThrow({
        where: { id: res2.id },
      });
      expect(updatedRes2.status).toBe(ReservationStatus.PROMOTED);
      expect(updatedRes2.holdId).not.toBeNull();

      // Physical copy must remain ON_HOLD for Member 2's new hold
      const updatedCopy = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(updatedCopy.status).toBe(CopyStatus.ON_HOLD);

      const member2Hold = await prisma.hold.findUniqueOrThrow({
        where: { id: updatedRes2.holdId! },
      });
      expect(member2Hold.userId).toBe(member2.id);
      expect(member2Hold.status).toBe(HoldStatus.ACTIVE);
      expect(member2Hold.source).toBe(HoldSource.QUEUE_PROMOTION);
    });
  });

  describe('5. System Delay Excuse (> 60 minutes after expiresAt)', () => {
    it('records missed pickup as excused when hold is expired > 60m late due to system delay', async () => {
      const member = await createMember('excused_member');
      const { book, copies } = await createBookWithCopies(
        'System Delay',
        1,
        CopyStatus.ON_HOLD,
      );
      const copy = copies[0];

      // Hold deadline was 75 minutes ago
      const deadline = new Date(fakeClock.now().getTime() - 75 * 60 * 1000);
      const hold = await prisma.hold.create({
        data: {
          userId: member.id,
          bookId: book.id,
          copyId: copy.id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: new Date(deadline.getTime() - 24 * 3600000),
          expiresAt: deadline,
        },
      });

      // Expire hold
      await holdsService.expireHold(hold.id);

      const pickup = await prisma.missedPickup.findUniqueOrThrow({
        where: { holdId: hold.id },
      });
      expect(pickup.excused).toBe(true);
      expect(pickup.excusedReason).toBe('SYSTEM_DELAY');
      expect(pickup.fineId).toBeNull();

      // Does NOT count toward fine threshold
      const unassessedCount = await prisma.missedPickup.count({
        where: { userId: member.id, fineId: null, excused: false },
      });
      expect(unassessedCount).toBe(0);

      const fines = await prisma.fine.findMany({
        where: { userId: member.id },
      });
      expect(fines).toHaveLength(0);
    });
  });

  describe('6. Catch-up Backlog Processing (250 Expired Holds in Batches)', () => {
    it('processes 250 expired holds across 3 batches cleanly', async () => {
      const { book, copies } = await createBookWithCopies(
        'Backlog Book',
        250,
        CopyStatus.ON_HOLD,
      );

      // Create 250 distinct members to satisfy @@unique([userId, bookId])
      const userBatch = Array.from({ length: 250 }, (_, i) => ({
        email: `backlog_${testRunId}_${i}_${Math.random().toString(36).substring(7)}@bookdrop.local`,
        name: `Backlog Patron ${i}`,
        role: Role.MEMBER,
        passwordHash: 'dummy-hash',
      }));
      await prisma.user.createMany({ data: userBatch });

      const createdUsers = await prisma.user.findMany({
        where: { email: { startsWith: `backlog_${testRunId}_` } },
        orderBy: { id: 'asc' },
      });

      const past = new Date(fakeClock.now().getTime() - 5000);

      // Create 250 active expired holds
      const holdsData = copies.map((copy, index) => ({
        userId: createdUsers[index].id,
        bookId: book.id,
        copyId: copy.id,
        status: HoldStatus.ACTIVE,
        source: HoldSource.REQUEST,
        createdAt: new Date(past.getTime() - 24 * 3600000),
        expiresAt: past,
      }));

      await prisma.hold.createMany({ data: holdsData });

      // Run expire-holds job
      const result = await jobRunner.runOnce('expire-holds');
      expect(result.status).toBe('COMPLETED');
      expect(result.stats?.processed).toBeGreaterThanOrEqual(250);
      expect(result.stats?.batches).toBeGreaterThanOrEqual(3);

      // Invariants check: all 250 holds expired and copies available
      const remainingActive = await prisma.hold.count({
        where: { bookId: book.id, status: HoldStatus.ACTIVE },
      });
      expect(remainingActive).toBe(0);

      const availableCopies = await prisma.copy.count({
        where: { bookId: book.id, status: CopyStatus.AVAILABLE },
      });
      expect(availableCopies).toBe(250);
    });
  });

  describe('7. Reminder Marks & Event Deduplication', () => {
    it('sweeps due soon, overdue, and expiring holds with at-most-once deduplication', async () => {
      const member = await createMember('reminders_member');
      const { book, copies } = await createBookWithCopies('Reminders Book', 3);

      const now = fakeClock.now();

      // Loan 1: Due in 24 hours (within 48h -> LOAN_DUE_SOON candidate)
      const loanDueSoon = await prisma.loan.create({
        data: {
          userId: member.id,
          bookId: book.id,
          copyId: copies[0].id,
          status: LoanStatus.ACTIVE,
          borrowedAt: new Date(now.getTime() - 5 * 24 * 3600000),
          dueAt: new Date(now.getTime() + 24 * 3600000),
          checkedOutById: staffUser.id,
        },
      });
      await prisma.copy.update({
        where: { id: copies[0].id },
        data: { status: CopyStatus.BORROWED },
      });

      // Loan 2: Due 2 days ago (now > dueAt -> LOAN_OVERDUE candidate, daysLate = 2)
      const loanOverdue = await prisma.loan.create({
        data: {
          userId: member.id,
          bookId: book.id,
          copyId: copies[1].id,
          status: LoanStatus.ACTIVE,
          borrowedAt: new Date(now.getTime() - 16 * 24 * 3600000),
          dueAt: new Date(now.getTime() - 2 * 24 * 3600000),
          checkedOutById: staffUser.id,
        },
      });
      await prisma.copy.update({
        where: { id: copies[1].id },
        data: { status: CopyStatus.BORROWED },
      });

      // Hold 1: Expires in 3 hours (within 6h -> HOLD_EXPIRING_SOON candidate)
      const holdExpiringSoon = await prisma.hold.create({
        data: {
          userId: member.id,
          bookId: book.id,
          copyId: copies[2].id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: new Date(now.getTime() - 45 * 3600000),
          expiresAt: new Date(now.getTime() + 3 * 3600000),
        },
      });
      await prisma.copy.update({
        where: { id: copies[2].id },
        data: { status: CopyStatus.ON_HOLD },
      });

      // Track events
      const events: { name: string; payload: any }[] = [];
      const dueSoonHandler = (p: any) =>
        events.push({ name: 'loan.due_soon', payload: p });
      const overdueHandler = (p: any) =>
        events.push({ name: 'loan.overdue', payload: p });
      const holdExpiringHandler = (p: any) =>
        events.push({ name: 'hold.expiring_soon', payload: p });

      eventEmitter.on('loan.due_soon', dueSoonHandler);
      eventEmitter.on('loan.overdue', overdueHandler);
      eventEmitter.on('hold.expiring_soon', holdExpiringHandler);

      // Run send-reminders job
      const runResult = await jobRunner.runOnce('send-reminders');
      expect(runResult.status).toBe('COMPLETED');
      expect(runResult.stats?.dueSoonReminders).toBeGreaterThanOrEqual(1);
      expect(runResult.stats?.overdueReminders).toBeGreaterThanOrEqual(1);
      expect(runResult.stats?.holdExpiringReminders).toBeGreaterThanOrEqual(1);

      // Verify events emitted for this specific member
      const dueSoonEvent = events.find(
        (e) =>
          e.name === 'loan.due_soon' && e.payload.loanId === loanDueSoon.id,
      );
      expect(dueSoonEvent).toBeDefined();

      const overdueEvent = events.find(
        (e) => e.name === 'loan.overdue' && e.payload.loanId === loanOverdue.id,
      );
      expect(overdueEvent).toBeDefined();
      expect(overdueEvent?.payload.daysLate).toBe(2);

      // Loan 2 must NEVER get loan.due_soon event
      const unexpectedDueSoon = events.find(
        (e) =>
          e.name === 'loan.due_soon' && e.payload.loanId === loanOverdue.id,
      );
      expect(unexpectedDueSoon).toBeUndefined();

      const holdExpiringEvent = events.find(
        (e) =>
          e.name === 'hold.expiring_soon' &&
          e.payload.holdId === holdExpiringSoon.id,
      );
      expect(holdExpiringEvent).toBeDefined();

      // Verify ReminderMark rows in database for this member
      const marks = await prisma.reminderMark.findMany({
        where: { userId: member.id },
      });
      expect(marks).toHaveLength(3);
      expect(
        marks.some(
          (m) =>
            m.kind === ReminderKind.LOAN_DUE_SOON &&
            m.loanId === loanDueSoon.id,
        ),
      ).toBe(true);
      expect(
        marks.some(
          (m) =>
            m.kind === ReminderKind.LOAN_OVERDUE && m.loanId === loanOverdue.id,
        ),
      ).toBe(true);
      expect(
        marks.some(
          (m) =>
            m.kind === ReminderKind.HOLD_EXPIRING_SOON &&
            m.holdId === holdExpiringSoon.id,
        ),
      ).toBe(true);

      // Clear event tracker and re-run job immediately
      events.length = 0;
      await prisma.jobLease.deleteMany();
      const secondRun = await jobRunner.runOnce('send-reminders');
      expect(secondRun.status).toBe('COMPLETED');

      // Verify no duplicate events re-emitted for our member
      const dupDueSoon = events.find(
        (e) => e.payload.loanId === loanDueSoon.id,
      );
      const dupOverdue = events.find(
        (e) => e.payload.loanId === loanOverdue.id,
      );
      const dupHold = events.find(
        (e) => e.payload.holdId === holdExpiringSoon.id,
      );
      expect(dupDueSoon).toBeUndefined();
      expect(dupOverdue).toBeUndefined();
      expect(dupHold).toBeUndefined();

      eventEmitter.off('loan.due_soon', dueSoonHandler);
      eventEmitter.off('loan.overdue', overdueHandler);
      eventEmitter.off('hold.expiring_soon', holdExpiringHandler);
    });
  });

  describe('8. Concurrency Race: confirmPickup vs expireHold', () => {
    it('resolves concurrent pickup and expiration cleanly: exactly one wins and no corrupt state', async () => {
      const member = await createMember('race_pickup_expire');
      const { book, copies } = await createBookWithCopies(
        'Race Book',
        1,
        CopyStatus.ON_HOLD,
      );
      const copy = copies[0];

      // Hold is at the exact boundary of expiring
      const hold = await prisma.hold.create({
        data: {
          userId: member.id,
          bookId: book.id,
          copyId: copy.id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          createdAt: new Date(fakeClock.now().getTime() - 24 * 3600000),
          expiresAt: fakeClock.now(),
        },
      });

      // Fire both simultaneously
      const [pickupResult, expireResult] = await Promise.allSettled([
        loansService.confirmPickup(hold.id, copy.barcode, staffUser.id),
        holdsService.expireHold(hold.id),
      ]);

      const updatedHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      const updatedCopy = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });

      if (pickupResult.status === 'fulfilled') {
        // Pickup won
        expect(updatedHold.status).toBe(HoldStatus.FULFILLED);
        expect(updatedCopy.status).toBe(CopyStatus.BORROWED);
        expect(
          expireResult.status === 'fulfilled' ? expireResult.value : null,
        ).toBeNull();
      } else {
        // Expiry won
        expect(updatedHold.status).toBe(HoldStatus.EXPIRED);
        expect(updatedCopy.status).toBe(CopyStatus.AVAILABLE);
      }
    });
  });

  describe('9. Concurrency: 3 Simultaneous Hold Expirations for One Member', () => {
    it('creates exactly 1 fine of Rs 100 when 3 holds for one member expire concurrently', async () => {
      const member = await createMember('concurrent_single_fine');

      // 3 distinct books (1 copy each, initialized to ON_HOLD) for 1 member
      const booksWithCopies = await Promise.all([
        createBookWithCopies('Conc Book 1', 1, CopyStatus.ON_HOLD),
        createBookWithCopies('Conc Book 2', 1, CopyStatus.ON_HOLD),
        createBookWithCopies('Conc Book 3', 1, CopyStatus.ON_HOLD),
      ]);

      const past = new Date(fakeClock.now().getTime() - 1000);
      const holds = await Promise.all(
        booksWithCopies.map(({ book, copies }) =>
          prisma.hold.create({
            data: {
              userId: member.id,
              bookId: book.id,
              copyId: copies[0].id,
              status: HoldStatus.ACTIVE,
              source: HoldSource.REQUEST,
              createdAt: new Date(past.getTime() - 24 * 3600000),
              expiresAt: past,
            },
          }),
        ),
      );

      // Run all 3 expirations concurrently
      await Promise.all(holds.map((h) => holdsService.expireHold(h.id)));

      // Assert exactly 1 fine created
      const fines = await prisma.fine.findMany({
        where: { userId: member.id, reason: FineReason.MISSED_PICKUPS },
      });
      expect(fines).toHaveLength(1);
      expect(fines[0].amountMinor).toBe(10000);

      // All 3 missed pickups assessed
      const pickups = await prisma.missedPickup.findMany({
        where: { userId: member.id },
      });
      expect(pickups).toHaveLength(3);
      for (const p of pickups) {
        expect(p.fineId).toBe(fines[0].id);
      }

      // Unassessed count resets to 0
      const unassessedCount = await prisma.missedPickup.count({
        where: { userId: member.id, fineId: null, excused: false },
      });
      expect(unassessedCount).toBe(0);
    });
  });

  describe('10. Proof of Advisory Lock Necessity: Race Condition Without Lock', () => {
    it('demonstrates that executing 3 hold expirations concurrently without advisory locks fails the invariant', async () => {
      const member = await createMember('no_lock_race');

      // 3 distinct books for 1 member
      const booksWithCopies = await Promise.all([
        createBookWithCopies('NoLock Book 1', 1, CopyStatus.ON_HOLD),
        createBookWithCopies('NoLock Book 2', 1, CopyStatus.ON_HOLD),
        createBookWithCopies('NoLock Book 3', 1, CopyStatus.ON_HOLD),
      ]);

      const past = new Date(fakeClock.now().getTime() - 1000);
      const holds = await Promise.all(
        booksWithCopies.map(({ book, copies }) =>
          prisma.hold.create({
            data: {
              userId: member.id,
              bookId: book.id,
              copyId: copies[0].id,
              status: HoldStatus.ACTIVE,
              source: HoldSource.REQUEST,
              createdAt: new Date(past.getTime() - 24 * 3600000),
              expiresAt: past,
            },
          }),
        ),
      );

      // Simulated naive expiry function WITHOUT member advisory lock
      const naiveExpireWithoutMemberLock = async (holdId: number) => {
        return withTransactionRetry(() =>
          prisma.$transaction(async (tx) => {
            // Deliberately omit pg_advisory_xact_lock
            const [hold] = await tx.$queryRaw<
              { id: number; userId: number; bookId: number; copyId: number }[]
            >`SELECT id, "userId", "bookId", "copyId" FROM "Hold" WHERE id = ${holdId} FOR UPDATE`;

            if (!hold) return null;

            await tx.hold.update({
              where: { id: holdId },
              data: { status: HoldStatus.EXPIRED },
            });

            await tx.missedPickup.create({
              data: {
                userId: hold.userId,
                holdId: hold.id,
                excused: false,
              },
            });

            // Read unassessed pickups concurrently without advisory lock
            const unassessed = await tx.missedPickup.findMany({
              where: { userId: hold.userId, fineId: null, excused: false },
              orderBy: { createdAt: 'asc' },
            });

            const { groups } = selectMissedPickupsToAssess(
              unassessed,
              MISSED_PICKUPS_BEFORE_FINE,
            );

            for (const group of groups) {
              const fine = await tx.fine.create({
                data: {
                  userId: hold.userId,
                  reason: FineReason.MISSED_PICKUPS,
                  amountMinor: 10000,
                  note: 'Missed pickup fine',
                  dedupeKey: `missed-pickups-nolock:${hold.userId}:${group[0].id}`,
                },
              });

              await tx.missedPickup.updateMany({
                where: { id: { in: group.map((p) => p.id) } },
                data: { fineId: fine.id },
              });
            }

            await tx.copy.update({
              where: { id: hold.copyId },
              data: { status: CopyStatus.AVAILABLE },
            });

            return true;
          }, INTERACTIVE_TX_OPTIONS),
        );
      };

      // Run 3 concurrent naive expirations
      await Promise.all(holds.map((h) => naiveExpireWithoutMemberLock(h.id)));

      // In a concurrent execution under Read Committed without advisory lock,
      // transactions do not see uncommitted rows from sibling transactions, so
      // unassessed count in each transaction is < 3, resulting in 0 fines created!
      const finesCreated = await prisma.fine.findMany({
        where: { userId: member.id, reason: FineReason.MISSED_PICKUPS },
      });

      // Proof: Without the advisory lock, the fine was NOT assessed!
      expect(finesCreated.length).not.toBe(1);
    });
  });

  describe('11. Concurrency Test Loop (50 Iterations)', () => {
    it('runs the 3-hold simultaneous expiration test 50 times in a loop with zero flakes', async () => {
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const loopMember = await createMember(`loop_${i}`);

        // 3 distinct books (1 copy each, initialized to ON_HOLD) for this member
        const booksWithCopies = await Promise.all([
          createBookWithCopies(`Loop Book A ${i}`, 1, CopyStatus.ON_HOLD),
          createBookWithCopies(`Loop Book B ${i}`, 1, CopyStatus.ON_HOLD),
          createBookWithCopies(`Loop Book C ${i}`, 1, CopyStatus.ON_HOLD),
        ]);

        const past = new Date(fakeClock.now().getTime() - 1000);
        const holds = await Promise.all(
          booksWithCopies.map(({ book, copies }) =>
            prisma.hold.create({
              data: {
                userId: loopMember.id,
                bookId: book.id,
                copyId: copies[0].id,
                status: HoldStatus.ACTIVE,
                source: HoldSource.REQUEST,
                createdAt: new Date(past.getTime() - 24 * 3600000),
                expiresAt: past,
              },
            }),
          ),
        );

        // Concurrently expire all 3 holds with full production advisory lock
        await Promise.all(holds.map((h) => holdsService.expireHold(h.id)));

        // Verify invariant: Exactly 1 fine created
        const fines = await prisma.fine.findMany({
          where: { userId: loopMember.id, reason: FineReason.MISSED_PICKUPS },
        });
        expect(fines).toHaveLength(1);
        expect(fines[0].amountMinor).toBe(10000);

        // Verify invariant: Unassessed count is exactly 0
        const unassessed = await prisma.missedPickup.count({
          where: { userId: loopMember.id, fineId: null, excused: false },
        });
        expect(unassessed).toBe(0);
      }
    });
  });
});
