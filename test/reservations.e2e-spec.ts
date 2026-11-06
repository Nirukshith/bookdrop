import { INestApplication, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyStatus,
  FineReason,
  FineStatus,
  HoldSource,
  HoldStatus,
  LoanStatus,
  ReservationCancelReason,
  ReservationStatus,
  ReturnCondition,
  Role,
} from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { ThrottlerStorage } from '@nestjs/throttler';
import { CopiesService } from '../src/circulation/copies/copies.service';
import { HoldsService } from '../src/circulation/holds/holds.service';
import { LoansService } from '../src/circulation/loans/loans.service';
import { ReservationsService } from '../src/circulation/reservations/reservations.service';
import { ClockService, FakeClockService } from '../src/common/clock';
import { DOMAIN_EVENT_NAMES } from '../src/contracts/events';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

describe('Reservations & Promotion Queue E2E (Stage 8 Full Suite)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let copiesService: CopiesService;
  let holdsService: HoldsService;
  let loansService: LoansService;
  let reservationsService: ReservationsService;
  let eventEmitter: EventEmitter2;
  let fakeClock: FakeClockService;

  let librarianToken: string;
  let librarianId: number;

  let adminId: number;

  let testAuthorId: number;
  let testCategoryId: number;

  const testRunId = Date.now();

  // -------------------------------------------------------------
  // System Invariant Verification Helper
  // -------------------------------------------------------------
  async function assertReservationInvariants(contextDescription = '') {
    expect(contextDescription).toBeDefined();
    // 1. Total active holds in DB must match total copies in ON_HOLD status
    const activeHolds = await prisma.hold.count({
      where: { status: HoldStatus.ACTIVE },
    });
    const onHoldCopies = await prisma.copy.count({
      where: { status: CopyStatus.ON_HOLD },
    });
    expect(activeHolds).toBe(onHoldCopies);

    // 2. For every active hold with source QUEUE_PROMOTION, there must be a matching PROMOTED reservation
    const promoActiveHolds = await prisma.hold.findMany({
      where: {
        status: HoldStatus.ACTIVE,
        source: HoldSource.QUEUE_PROMOTION,
      },
    });

    for (const hold of promoActiveHolds) {
      const res = await prisma.reservation.findUnique({
        where: { holdId: hold.id },
      });
      expect(res).toBeDefined();
      expect(res?.status).toBe(ReservationStatus.PROMOTED);
      expect(res?.userId).toBe(hold.userId);
      expect(res?.bookId).toBe(hold.bookId);
    }

    // 3. For every PROMOTED reservation, holdId must point to an existing Hold
    const promotedReservations = await prisma.reservation.findMany({
      where: { status: ReservationStatus.PROMOTED },
    });
    for (const r of promotedReservations) {
      expect(r.holdId).not.toBeNull();
      const hold = await prisma.hold.findUnique({
        where: { id: r.holdId! },
      });
      expect(hold).toBeDefined();
    }

    // 4. No patron has more than 1 WAITING reservation per book (Partial Unique Constraint)
    const duplicateWaiting = await prisma.$queryRaw<
      { userId: number; bookId: number; count: bigint }[]
    >`
      SELECT "userId", "bookId", COUNT(*) as count
      FROM "Reservation"
      WHERE status = 'WAITING'
      GROUP BY "userId", "bookId"
      HAVING COUNT(*) > 1
    `;
    expect(duplicateWaiting.length).toBe(0);

    // 5. No copy can have more than one ACTIVE loan
    const duplicateLoans = await prisma.$queryRaw<
      { copyId: number; count: bigint }[]
    >`
      SELECT "copyId", COUNT(*) as count
      FROM "Loan"
      WHERE status = 'ACTIVE'
      GROUP BY "copyId"
      HAVING COUNT(*) > 1
    `;
    expect(duplicateLoans.length).toBe(0);
  }

  // GraphQL query helper
  function gql(query: string, variables?: Record<string, any>, token?: string) {
    const req = request(app.getHttpServer()).post('/graphql');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    return req.send({ query, variables });
  }

  beforeAll(async () => {
    fakeClock = new FakeClockService('2026-11-01T10:00:00.000Z');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClockService)
      .useValue(fakeClock)
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    usersService = app.get(UsersService);
    authService = app.get(AuthService);
    copiesService = app.get(CopiesService);
    holdsService = app.get(HoldsService);
    loansService = app.get(LoansService);
    reservationsService = app.get(ReservationsService);
    eventEmitter = app.get(EventEmitter2);

    // Setup Category & Author
    const category = await prisma.category.create({
      data: { name: `Res_Cat_${testRunId}` },
    });
    testCategoryId = category.id;

    const author = await prisma.author.create({
      data: { name: `Res_Author_${testRunId}` },
    });
    testAuthorId = author.id;

    // Create Staff Users
    const libEmail = `res_librarian_${testRunId}@test.local`;
    const lib = await usersService.create({
      email: libEmail,
      name: 'Reservation Librarian',
      password: 'StaffPass123!',
      role: Role.LIBRARIAN,
    });
    librarianId = lib.id;
    const libLogin = await authService.login({
      email: libEmail,
      password: 'StaffPass123!',
    });
    librarianToken = libLogin.accessToken;

    const admEmail = `res_admin_${testRunId}@test.local`;
    const adm = await usersService.create({
      email: admEmail,
      name: 'Reservation Admin',
      password: 'AdminPass123!',
      role: Role.ADMIN,
    });
    adminId = adm.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createFreshMember(prefix = 'patron') {
    const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}@test.local`;
    const user = await usersService.create({
      email,
      name: 'Fresh Patron',
      password: 'Password123!',
      role: Role.MEMBER,
    });
    const login = await authService.login({
      email,
      password: 'Password123!',
    });
    return { id: user.id, email, token: login.accessToken };
  }

  async function borrowCopy(copyBarcode: string) {
    const dummyBorrower = await createFreshMember('borrower');
    return loansService.checkoutCopy(
      dummyBorrower.id,
      copyBarcode,
      librarianId,
    );
  }

  async function createTestBook(
    title: string,
    copyCount = 1,
    priceMinor = 50000,
  ) {
    const book = await prisma.book.create({
      data: {
        title: `${title}_${Date.now()}_${Math.random()}`,
        isbn: `ISBN-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        authors: { connect: [{ id: testAuthorId }] },
        categories: { connect: [{ id: testCategoryId }] },
        priceMinor,
      },
    });

    const copies = [];
    for (let i = 0; i < copyCount; i++) {
      const copy = await prisma.copy.create({
        data: {
          bookId: book.id,
          barcode: `BD-RES-${book.id}-${i + 1}-${Math.floor(Math.random() * 100000)}`,
          status: CopyStatus.AVAILABLE,
          shelfLocation: 'STACK-RES',
        },
      });
      copies.push(copy);
    }

    return { book, copies };
  }

  // =============================================================
  // Suite 1: Joining the Queue & Eligibility Policies
  // =============================================================
  describe('1. Joining the Reservation Queue', () => {
    it('rejects joining when book has AVAILABLE copy (throws COPY_AVAILABLE)', async () => {
      const member = await createFreshMember('avail_check');
      const { book } = await createTestBook('Available Book', 1);

      const res = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) {
            id
          }
        }`,
        { bookId: book.id },
        member.token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('COPY_AVAILABLE');
    });

    it('rejects joining non-existent book (throws BOOK_NOT_FOUND)', async () => {
      const member = await createFreshMember('notfound_check');
      const res = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) {
            id
          }
        }`,
        { bookId: 999999 },
        member.token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('BOOK_NOT_FOUND');
    });

    it('allows joining when book has 0 AVAILABLE copies -> WAITING at position 1, emits event', async () => {
      const member = await createFreshMember('join_success');
      const { book, copies } = await createTestBook('Checked Out Book', 1);

      // Check out the only copy to a borrower
      await borrowCopy(copies[0].barcode);

      // Track emitted domain events
      const emittedEvents: any[] = [];
      const listener = (event: any) => emittedEvents.push(event);
      eventEmitter.on(DOMAIN_EVENT_NAMES.RESERVATION_JOINED, listener);

      try {
        const res = await gql(
          `mutation JoinQueue($bookId: Int!) {
            joinReservationQueue(bookId: $bookId) {
              id
              userId
              bookId
              status
              position
              createdAt
            }
          }`,
          { bookId: book.id },
          member.token,
        );

        expect(res.body.errors).toBeUndefined();
        const data = res.body.data.joinReservationQueue;
        expect(data.status).toBe('WAITING');
        expect(data.position).toBe(1);
        expect(Number(data.bookId)).toBe(book.id);
        expect(data.userId).toBe(member.id);

        // Verify emitted domain event
        expect(emittedEvents.length).toBe(1);
        expect(emittedEvents[0].userId).toBe(member.id);
        expect(emittedEvents[0].bookId).toBe(book.id);
        expect(emittedEvents[0].position).toBe(1);
      } finally {
        eventEmitter.off(DOMAIN_EVENT_NAMES.RESERVATION_JOINED, listener);
      }
    });

    it('second patron joins queue -> WAITING at position 2, book queueLength is 2', async () => {
      const m1 = await createFreshMember('m1');
      const m2 = await createFreshMember('m2');
      const { book, copies } = await createTestBook('Multi Wait Book', 1);

      await borrowCopy(copies[0].barcode);

      // Member 1 joins -> pos 1
      const res1 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) {
            id
            position
          }
        }`,
        { bookId: book.id },
        m1.token,
      );
      expect(res1.body.errors).toBeUndefined();
      expect(res1.body.data.joinReservationQueue.position).toBe(1);

      // Member 2 joins -> pos 2
      const res2 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) {
            id
            position
          }
        }`,
        { bookId: book.id },
        m2.token,
      );
      expect(res2.body.errors).toBeUndefined();
      expect(res2.body.data.joinReservationQueue.position).toBe(2);

      // Verify book queueLength
      const bookRes = await gql(
        `query GetBook($id: Int!) {
          book(id: $id) {
            id
            queueLength
            availableCopies
          }
        }`,
        { id: book.id },
      );
      expect(bookRes.body.data.book.queueLength).toBe(2);
      expect(bookRes.body.data.book.availableCopies).toBe(0);
    });

    it('rejects duplicate join by same patron on same book (throws ALREADY_QUEUED)', async () => {
      const member = await createFreshMember('dupe_join');
      const { book, copies } = await createTestBook('Dupe Join Book', 1);

      await borrowCopy(copies[0].barcode);

      // Join once
      await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );

      // Attempt duplicate join
      const res = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('ALREADY_QUEUED');
    });

    it('rejects joining when member already has an active hold on the book (throws ALREADY_HELD)', async () => {
      const member = await createFreshMember('already_held');
      const { book, copies } = await createTestBook('Hold Existing Book', 2);

      // Member places a hold on copy 1
      await holdsService.requestHold(member.id, book.id);

      // Staff checks out copy 2, so 0 copies available
      await borrowCopy(copies[1].barcode);

      // Member attempts to join queue for the same book
      const res = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('ALREADY_HELD');
    });

    it('rejects joining when member has UNPAID fines (throws UNPAID_FINES)', async () => {
      const freshMember = await createFreshMember('fined');
      const { book, copies } = await createTestBook('Fined Patron Book', 1);

      await borrowCopy(copies[0].barcode);

      // Assess unpaid fine
      await prisma.fine.create({
        data: {
          userId: freshMember.id,
          reason: FineReason.DAMAGED_BOOK,
          amountMinor: 2500,
          paidMinor: 0,
          status: FineStatus.UNPAID,
          note: 'E2E fine test',
          createdById: adminId,
        },
      });

      const res = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        freshMember.token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('UNPAID_FINES');
    });

    it('rejects joining when member has OVERDUE loans (throws OVERDUE_LOANS)', async () => {
      const freshMember = await createFreshMember('overdue');
      const { book, copies } = await createTestBook('Overdue Patron Book', 1);
      const { book: loanBook, copies: loanCopies } = await createTestBook(
        'Borrowed Book',
        1,
      );

      await borrowCopy(copies[0].barcode);

      // Create an overdue loan for freshMember
      const pastBorrowed = new Date(
        fakeClock.now().getTime() - 20 * 24 * 60 * 60 * 1000,
      );
      const pastDue = new Date(
        fakeClock.now().getTime() - 5 * 24 * 60 * 60 * 1000,
      );

      await prisma.loan.create({
        data: {
          userId: freshMember.id,
          copyId: loanCopies[0].id,
          bookId: loanBook.id,
          status: LoanStatus.ACTIVE,
          borrowedAt: pastBorrowed,
          dueAt: pastDue,
          checkedOutById: librarianId,
        },
      });
      await prisma.copy.update({
        where: { id: loanCopies[0].id },
        data: { status: CopyStatus.BORROWED },
      });

      const res = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        freshMember.token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('OVERDUE_LOANS');
    });

    it('enforces MAX_ACTIVE_RESERVATIONS limit (5) -> 6th join throws QUEUE_LIMIT_REACHED', async () => {
      const freshMember = await createFreshMember('limit');

      // Create 5 books and put freshMember in queue for each
      for (let i = 0; i < 5; i++) {
        const { book, copies } = await createTestBook(`Limit Book ${i}`, 1);
        await borrowCopy(copies[0].barcode);
        const joinRes = await gql(
          `mutation JoinQueue($bookId: Int!) {
            joinReservationQueue(bookId: $bookId) { id }
          }`,
          { bookId: book.id },
          freshMember.token,
        );
        expect(joinRes.body.errors).toBeUndefined();
      }

      // 6th book
      const { book: book6, copies: copies6 } = await createTestBook(
        'Limit Book 6',
        1,
      );
      await borrowCopy(copies6[0].barcode);

      const res6 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book6.id },
        freshMember.token,
      );

      expect(res6.body.errors).toBeDefined();
      expect(res6.body.errors[0].extensions?.code).toBe('QUEUE_LIMIT_REACHED');
    });
  });

  // =============================================================
  // Suite 2: Queries and Leaving the Queue
  // =============================================================
  describe('2. Queries & Leaving the Queue', () => {
    it('member can cancel their own reservation -> CANCELLED with MEMBER reason, emits event', async () => {
      const member = await createFreshMember('cancel_own');
      const { book, copies } = await createTestBook('Cancel Book', 1);
      await borrowCopy(copies[0].barcode);

      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      const emittedEvents: any[] = [];
      const listener = (event: any) => emittedEvents.push(event);
      eventEmitter.on(DOMAIN_EVENT_NAMES.RESERVATION_CANCELLED, listener);

      try {
        const cancelRes = await gql(
          `mutation CancelRes($reservationId: Int!) {
            cancelReservation(reservationId: $reservationId) {
              id
              status
              cancelReason
              cancelledAt
            }
          }`,
          { reservationId: resId },
          member.token,
        );

        expect(cancelRes.body.errors).toBeUndefined();
        const data = cancelRes.body.data.cancelReservation;
        expect(data.status).toBe('CANCELLED');
        expect(data.cancelReason).toBe('MEMBER');
        expect(data.cancelledAt).toBeDefined();

        expect(emittedEvents.length).toBe(1);
        expect(emittedEvents[0].reservationId).toBe(resId);
        expect(emittedEvents[0].reason).toBe(ReservationCancelReason.MEMBER);
      } finally {
        eventEmitter.off(DOMAIN_EVENT_NAMES.RESERVATION_CANCELLED, listener);
      }
    });

    it('staff can cancel patron reservation -> CANCELLED with STAFF reason', async () => {
      const member = await createFreshMember('staff_cancel');
      const { book, copies } = await createTestBook('Staff Cancel Book', 1);
      await borrowCopy(copies[0].barcode);

      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      const cancelRes = await gql(
        `mutation CancelRes($reservationId: Int!) {
          cancelReservation(reservationId: $reservationId) {
            id
            status
            cancelReason
          }
        }`,
        { reservationId: resId },
        librarianToken,
      );

      expect(cancelRes.body.errors).toBeUndefined();
      expect(cancelRes.body.data.cancelReservation.status).toBe('CANCELLED');
      expect(cancelRes.body.data.cancelReservation.cancelReason).toBe('STAFF');
    });

    it('member cannot cancel another member reservation (throws RESERVATION_NOT_FOUND)', async () => {
      const m1 = await createFreshMember('unauth_m1');
      const m2 = await createFreshMember('unauth_m2');
      const { book, copies } = await createTestBook(
        'Unauthorized Cancel Book',
        1,
      );
      await borrowCopy(copies[0].barcode);

      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m1.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Member 2 tries to cancel Member 1's reservation
      const cancelRes = await gql(
        `mutation CancelRes($reservationId: Int!) {
          cancelReservation(reservationId: $reservationId) { id }
        }`,
        { reservationId: resId },
        m2.token,
      );

      expect(cancelRes.body.errors).toBeDefined();
      expect(cancelRes.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });

    it('cancelling already-cancelled reservation fails (throws RESERVATION_NOT_WAITING)', async () => {
      const member = await createFreshMember('double_cancel');
      const { book, copies } = await createTestBook(
        'Already Cancelled Book',
        1,
      );
      await borrowCopy(copies[0].barcode);

      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      await gql(
        `mutation CancelRes($reservationId: Int!) {
          cancelReservation(reservationId: $reservationId) { id }
        }`,
        { reservationId: resId },
        member.token,
      );

      // Attempt to cancel again
      const res2 = await gql(
        `mutation CancelRes($reservationId: Int!) {
          cancelReservation(reservationId: $reservationId) { id }
        }`,
        { reservationId: resId },
        member.token,
      );

      expect(res2.body.errors).toBeDefined();
      expect(res2.body.errors[0].extensions?.code).toBe(
        'RESERVATION_NOT_WAITING',
      );
    });

    it('myReservations returns active reservations and resolved book/position', async () => {
      const freshMember = await createFreshMember('myres');
      const { book, copies } = await createTestBook('My Res Book', 1);
      await borrowCopy(copies[0].barcode);

      await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        freshMember.token,
      );

      const queryRes = await gql(
        `query MyReservations {
          myReservations {
            id
            status
            position
            book {
              id
              title
            }
          }
        }`,
        {},
        freshMember.token,
      );

      expect(queryRes.body.errors).toBeUndefined();
      const list = queryRes.body.data.myReservations;
      expect(list.length).toBe(1);
      expect(list[0].position).toBe(1);
      expect(Number(list[0].book.id)).toBe(book.id);
    });

    it('queueForBook returns FIFO list for staff with patron details', async () => {
      const m1 = await createFreshMember('q_m1');
      const m2 = await createFreshMember('q_m2');
      const { book, copies } = await createTestBook('Queue Query Book', 1);
      await borrowCopy(copies[0].barcode);

      await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m1.token,
      );

      await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m2.token,
      );

      const res = await gql(
        `query QueueForBook($bookId: Int!) {
          queueForBook(bookId: $bookId) {
            id
            userId
            status
            position
            user {
              id
              email
            }
          }
        }`,
        { bookId: book.id },
        librarianToken,
      );

      expect(res.body.errors).toBeUndefined();
      const queue = res.body.data.queueForBook;
      expect(queue.length).toBe(2);
      expect(queue[0].position).toBe(1);
      expect(queue[0].userId).toBe(m1.id);
      expect(queue[1].position).toBe(2);
      expect(queue[1].userId).toBe(m2.id);
    });
  });

  // =============================================================
  // Suite 3: Promotion Engine & Automatic Assignment
  // =============================================================
  describe('3. Automatic FIFO Promotion on Copy Availability', () => {
    it('promotes position 1 waiting patron when loan is returned in GOOD condition', async () => {
      const m1 = await createFreshMember('ret_m1');
      const m2 = await createFreshMember('ret_m2');
      const { book, copies } = await createTestBook('Return Promo Book', 1);

      // Check out copy to staff
      await borrowCopy(copies[0].barcode);

      // Member 1 joins queue -> pos 1
      const res1 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m1.token,
      );
      const res1Id = Number(res1.body.data.joinReservationQueue.id);

      // Member 2 joins queue -> pos 2
      const res2 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m2.token,
      );
      const res2Id = Number(res2.body.data.joinReservationQueue.id);

      // Listen for domain events
      const promoEvents: any[] = [];
      const holdEvents: any[] = [];
      const promoListener = (e: any) => promoEvents.push(e);
      const holdListener = (e: any) => holdEvents.push(e);
      eventEmitter.on(DOMAIN_EVENT_NAMES.RESERVATION_PROMOTED, promoListener);
      eventEmitter.on(DOMAIN_EVENT_NAMES.HOLD_CREATED, holdListener);

      try {
        // Return loan in GOOD condition
        await loansService.returnLoan({
          copyBarcode: copies[0].barcode,
          condition: ReturnCondition.GOOD,
          staffId: librarianId,
        });

        // Member 1 reservation should now be PROMOTED
        const updatedRes1 = await prisma.reservation.findUnique({
          where: { id: res1Id },
          include: { hold: true },
        });
        expect(updatedRes1?.status).toBe(ReservationStatus.PROMOTED);
        expect(updatedRes1?.promotedAt).toBeDefined();
        expect(updatedRes1?.holdId).toBeDefined();

        // Linked hold must have QUEUE_PROMOTION source and ACTIVE status
        expect(updatedRes1?.hold?.source).toBe(HoldSource.QUEUE_PROMOTION);
        expect(updatedRes1?.hold?.status).toBe(HoldStatus.ACTIVE);
        expect(updatedRes1?.hold?.copyId).toBe(copies[0].id);

        // Copy must be ON_HOLD
        const updatedCopy = await prisma.copy.findUnique({
          where: { id: copies[0].id },
        });
        expect(updatedCopy?.status).toBe(CopyStatus.ON_HOLD);

        // Member 2 should now be at position 1 in the queue
        const pos2 = await reservationsService.getQueuePosition(res2Id);
        expect(pos2).toBe(1);

        // Events emitted
        expect(promoEvents.length).toBe(1);
        expect(promoEvents[0].reservationId).toBe(res1Id);
        expect(promoEvents[0].holdId).toBe(updatedRes1?.holdId);

        expect(holdEvents.length).toBe(1);
        expect(holdEvents[0].holdId).toBe(updatedRes1?.holdId);
      } finally {
        eventEmitter.off(
          DOMAIN_EVENT_NAMES.RESERVATION_PROMOTED,
          promoListener,
        );
        eventEmitter.off(DOMAIN_EVENT_NAMES.HOLD_CREATED, holdListener);
      }

      await assertReservationInvariants('after loan return promotion');
    });

    it('does NOT promote when copy is returned in DAMAGED condition', async () => {
      const member = await createFreshMember('dmg_member');
      const { book, copies } = await createTestBook('Damaged Return Book', 1);

      await borrowCopy(copies[0].barcode);

      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Return copy DAMAGED
      await loansService.returnLoan({
        copyBarcode: copies[0].barcode,
        condition: ReturnCondition.DAMAGED,
        conditionNote: 'Water damage and torn cover',
        damageFeeMinor: 2000,
        staffId: librarianId,
      });

      // Copy should be DAMAGED, patron still WAITING
      const copy = await prisma.copy.findUnique({
        where: { id: copies[0].id },
      });
      expect(copy?.status).toBe(CopyStatus.DAMAGED);

      const res = await prisma.reservation.findUnique({ where: { id: resId } });
      expect(res?.status).toBe(ReservationStatus.WAITING);

      await assertReservationInvariants('after damaged return');
    });

    it('promotes next waiting member when an active hold is cancelled', async () => {
      const m1 = await createFreshMember('h_cancel_m1');
      const m2 = await createFreshMember('h_cancel_m2');
      const { book, copies } = await createTestBook(
        'Hold Cancel Promo Book',
        1,
      );

      // Member 1 places hold
      const hold = await holdsService.requestHold(m1.id, book.id);

      // Member 2 joins queue
      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m2.token,
      );
      const res2Id = Number(joinRes.body.data.joinReservationQueue.id);

      // Member 1 cancels their hold
      await holdsService.cancelHold(hold.id, { id: m1.id, role: Role.MEMBER });

      // Member 2 should now be PROMOTED
      const updatedRes2 = await prisma.reservation.findUnique({
        where: { id: res2Id },
        include: { hold: true },
      });
      expect(updatedRes2?.status).toBe(ReservationStatus.PROMOTED);
      expect(updatedRes2?.hold?.status).toBe(HoldStatus.ACTIVE);
      expect(updatedRes2?.hold?.source).toBe(HoldSource.QUEUE_PROMOTION);

      // Copy remains ON_HOLD (reassigned to Member 2)
      const copy = await prisma.copy.findUnique({
        where: { id: copies[0].id },
      });
      expect(copy?.status).toBe(CopyStatus.ON_HOLD);

      await assertReservationInvariants('after hold cancel promotion');
    });

    it('promotes next waiting member when an active hold expires', async () => {
      const m1 = await createFreshMember('h_exp_m1');
      const m3 = await createFreshMember('h_exp_m3');
      const { book } = await createTestBook('Hold Expire Promo Book', 1);

      // Member 1 places hold
      const hold = await holdsService.requestHold(m1.id, book.id);

      // Member 3 joins queue
      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        m3.token,
      );
      const res3Id = Number(joinRes.body.data.joinReservationQueue.id);

      // Advance clock past expiration
      fakeClock.advanceMs(2 * 24 * 60 * 60 * 1000); // 2 days

      // Expire due holds
      await holdsService.expireDueHolds();

      // Hold 1 is EXPIRED
      const expiredHold = await prisma.hold.findUnique({
        where: { id: hold.id },
      });
      expect(expiredHold?.status).toBe(HoldStatus.EXPIRED);

      // Member 3 is PROMOTED
      const updatedRes3 = await prisma.reservation.findUnique({
        where: { id: res3Id },
        include: { hold: true },
      });
      expect(updatedRes3?.status).toBe(ReservationStatus.PROMOTED);
      expect(updatedRes3?.hold?.status).toBe(HoldStatus.ACTIVE);

      await assertReservationInvariants('after hold expiration promotion');
    });

    it('promotes waiting member when a new copy is added to the catalog', async () => {
      const member = await createFreshMember('add_copy_m');
      const { book, copies } = await createTestBook('New Copy Promo Book', 1);

      // Borrow the only copy
      await borrowCopy(copies[0].barcode);

      // Member joins queue
      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Add a new copy to the book
      const newCopy = await copiesService.addCopy(
        book.id,
        `NEW-${book.id}-${Date.now()}`,
        'STACK-NEW',
      );

      // Member should immediately be PROMOTED onto the new copy
      const updatedRes = await prisma.reservation.findUnique({
        where: { id: resId },
        include: { hold: true },
      });
      expect(updatedRes?.status).toBe(ReservationStatus.PROMOTED);
      expect(updatedRes?.hold?.copyId).toBe(newCopy.id);
      expect(updatedRes?.hold?.status).toBe(HoldStatus.ACTIVE);

      // New copy is ON_HOLD, not AVAILABLE
      const checkCopy = await prisma.copy.findUnique({
        where: { id: newCopy.id },
      });
      expect(checkCopy?.status).toBe(CopyStatus.ON_HOLD);

      await assertReservationInvariants('after add copy promotion');
    });

    it('promotes waiting member when damaged copy is repaired to AVAILABLE', async () => {
      const member = await createFreshMember('repair_member');
      const { book, copies } = await createTestBook('Repair Promo Book', 1);

      // Mark copy as DAMAGED
      await copiesService.transitionStatus(
        copies[0].id,
        [CopyStatus.AVAILABLE],
        CopyStatus.DAMAGED,
        { reason: 'Damaged spine' },
      );

      // Member joins queue (0 copies available)
      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        member.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Staff repairs copy from DAMAGED to AVAILABLE
      await copiesService.transitionStatus(
        copies[0].id,
        [CopyStatus.DAMAGED],
        CopyStatus.AVAILABLE,
        { reason: 'Repaired and ready for circulation' },
      );

      // Member is automatically promoted
      const updatedRes = await prisma.reservation.findUnique({
        where: { id: resId },
        include: { hold: true },
      });
      expect(updatedRes?.status).toBe(ReservationStatus.PROMOTED);
      expect(updatedRes?.hold?.copyId).toBe(copies[0].id);

      await assertReservationInvariants('after copy repair promotion');
    });
  });

  // =============================================================
  // Suite 4: Ineligibility Skipping Policy
  // =============================================================
  describe('4. Ineligibility Skipping & Position Retention', () => {
    it('skips ineligible patron (unpaid fines) and promotes next eligible patron', async () => {
      const finedPatron = await createFreshMember('ineligible_fined');
      const cleanPatron = await createFreshMember('eligible_clean');
      const { book, copies } = await createTestBook('Skip Fine Book', 1);

      // Borrow copy
      await borrowCopy(copies[0].barcode);

      // Candidate 1 joins queue while clean
      const join1 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        finedPatron.token,
      );
      const res1Id = Number(join1.body.data.joinReservationQueue.id);

      // Candidate 2 joins queue -> pos 2
      const join2 = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        cleanPatron.token,
      );
      const res2Id = Number(join2.body.data.joinReservationQueue.id);

      // Now assess an unpaid fine on Candidate 1 (making Candidate 1 ineligible for promotion)
      await prisma.fine.create({
        data: {
          userId: finedPatron.id,
          reason: FineReason.DAMAGED_BOOK,
          amountMinor: 3000,
          paidMinor: 0,
          status: FineStatus.UNPAID,
          createdById: adminId,
        },
      });

      // Copy is returned in GOOD condition
      await loansService.returnLoan({
        copyBarcode: copies[0].barcode,
        condition: ReturnCondition.GOOD,
        staffId: librarianId,
      });

      // Candidate 1 was SKIPPED: remains WAITING, still at position 1 in queue!
      const checkRes1 = await prisma.reservation.findUnique({
        where: { id: res1Id },
      });
      expect(checkRes1?.status).toBe(ReservationStatus.WAITING);

      // Candidate 2 was PROMOTED!
      const checkRes2 = await prisma.reservation.findUnique({
        where: { id: res2Id },
        include: { hold: true },
      });
      expect(checkRes2?.status).toBe(ReservationStatus.PROMOTED);
      expect(checkRes2?.hold?.userId).toBe(cleanPatron.id);
      expect(checkRes2?.hold?.status).toBe(HoldStatus.ACTIVE);

      // Copy is ON_HOLD for Candidate 2
      const copy = await prisma.copy.findUnique({
        where: { id: copies[0].id },
      });
      expect(copy?.status).toBe(CopyStatus.ON_HOLD);

      await assertReservationInvariants('after ineligibility skip');
    });

    it('leaves copy AVAILABLE if all waiting patrons are ineligible', async () => {
      const finedPatron = await createFreshMember('all_fined');
      const { book, copies } = await createTestBook('All Ineligible Book', 1);

      await borrowCopy(copies[0].barcode);

      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        finedPatron.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Assess fine
      await prisma.fine.create({
        data: {
          userId: finedPatron.id,
          reason: FineReason.LOST_BOOK,
          amountMinor: 50000,
          paidMinor: 0,
          status: FineStatus.UNPAID,
          createdById: adminId,
        },
      });

      // Return loan
      await loansService.returnLoan({
        copyBarcode: copies[0].barcode,
        condition: ReturnCondition.GOOD,
        staffId: librarianId,
      });

      // Patron stays WAITING
      const checkRes = await prisma.reservation.findUnique({
        where: { id: resId },
      });
      expect(checkRes?.status).toBe(ReservationStatus.WAITING);

      // Copy simply stays AVAILABLE
      const copy = await prisma.copy.findUnique({
        where: { id: copies[0].id },
      });
      expect(copy?.status).toBe(CopyStatus.AVAILABLE);

      await assertReservationInvariants('after all ineligible');
    });
  });

  // =============================================================
  // Suite 5: Superseding Mechanism
  // =============================================================
  describe('5. Superseding Active Reservations', () => {
    it('hold request supersedes and cancels active WAITING reservation with SUPERSEDED reason', async () => {
      const freshMember = await createFreshMember('supersede_hold');
      const { book, copies } = await createTestBook('Supersede Hold Book', 2);

      // Check out both copies so 0 available
      await borrowCopy(copies[0].barcode);
      await borrowCopy(copies[1].barcode);

      // Member joins queue
      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        freshMember.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Return copy 1 to AVAILABLE directly (bypassing queue for test setup)
      await prisma.loan.updateMany({
        where: { copyId: copies[0].id, status: LoanStatus.ACTIVE },
        data: { status: LoanStatus.RETURNED, returnedAt: new Date() },
      });
      await prisma.copy.update({
        where: { id: copies[0].id },
        data: { status: CopyStatus.AVAILABLE },
      });

      // FreshMember requests a hold on the book
      await holdsService.requestHold(freshMember.id, book.id);

      // Reservation should now be CANCELLED with SUPERSEDED reason
      const checkRes = await prisma.reservation.findUnique({
        where: { id: resId },
      });
      expect(checkRes?.status).toBe(ReservationStatus.CANCELLED);
      expect(checkRes?.cancelReason).toBe(ReservationCancelReason.SUPERSEDED);
      expect(checkRes?.cancelledById).toBe(freshMember.id);
      expect(checkRes?.cancelledAt).toBeDefined();

      await assertReservationInvariants('after hold supersede');
    });

    it('walk-in checkoutCopy supersedes and cancels active WAITING reservation with SUPERSEDED reason', async () => {
      const freshMember = await createFreshMember('supersede_checkout');
      const { book, copies } = await createTestBook(
        'Supersede Checkout Book',
        2,
      );

      // Check out copy 1 and copy 2
      await borrowCopy(copies[0].barcode);
      await borrowCopy(copies[1].barcode);

      // Member joins queue
      const joinRes = await gql(
        `mutation JoinQueue($bookId: Int!) {
          joinReservationQueue(bookId: $bookId) { id }
        }`,
        { bookId: book.id },
        freshMember.token,
      );
      const resId = Number(joinRes.body.data.joinReservationQueue.id);

      // Free copy 1 to AVAILABLE
      await prisma.loan.updateMany({
        where: { copyId: copies[0].id, status: LoanStatus.ACTIVE },
        data: { status: LoanStatus.RETURNED, returnedAt: new Date() },
      });
      await prisma.copy.update({
        where: { id: copies[0].id },
        data: { status: CopyStatus.AVAILABLE },
      });

      // Member does a walk-in checkout at the desk
      await loansService.checkoutCopy(
        freshMember.id,
        copies[0].barcode,
        librarianId,
      );

      // Reservation should now be CANCELLED with SUPERSEDED reason
      const checkRes = await prisma.reservation.findUnique({
        where: { id: resId },
      });
      expect(checkRes?.status).toBe(ReservationStatus.CANCELLED);
      expect(checkRes?.cancelReason).toBe(ReservationCancelReason.SUPERSEDED);
      expect(checkRes?.cancelledById).toBe(librarianId);

      await assertReservationInvariants('after checkout supersede');
    });
  });

  // =============================================================
  // Suite 6: Concurrency & Lock Safety
  // =============================================================
  describe('6. Concurrency & Transaction Safety', () => {
    it('handles concurrent joins without deadlocks or invariant breaks', async () => {
      const { book, copies } = await createTestBook('Concurrent Join Book', 1);

      await borrowCopy(copies[0].barcode);

      // Create 5 fresh members
      const patrons = await Promise.all([
        createFreshMember('c1'),
        createFreshMember('c2'),
        createFreshMember('c3'),
        createFreshMember('c4'),
        createFreshMember('c5'),
      ]);

      // All 5 attempt to join queue concurrently
      const results = await Promise.all(
        patrons.map((p) =>
          gql(
            `mutation JoinQueue($bookId: Int!) {
              joinReservationQueue(bookId: $bookId) {
                id
                position
              }
            }`,
            { bookId: book.id },
            p.token,
          ),
        ),
      );

      // All 5 must succeed
      for (const res of results) {
        expect(res.body.errors).toBeUndefined();
      }

      // Check queue length
      const queue = await reservationsService.getQueueForBook(book.id);
      expect(queue.length).toBe(5);

      // Positions must be strictly 1, 2, 3, 4, 5
      const positions = await Promise.all(
        queue.map((r) => reservationsService.getQueuePosition(r.id)),
      );
      expect(positions).toEqual([1, 2, 3, 4, 5]);

      await assertReservationInvariants('after concurrent joins');
    });
  });
});
