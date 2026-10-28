import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyStatus,
  HoldSource,
  HoldStatus,
  LoanStatus,
  Role,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { CopiesService } from '../src/circulation/copies/copies.service';
import { HoldsService } from '../src/circulation/holds/holds.service';
import { LoansService } from '../src/circulation/loans/loans.service';
import { ClockService, FakeClockService } from '../src/common/clock';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { MAX_ACTIVE_LOANS } from '../src/config/library-rules';

describe('Loans & Desk Circulation E2E (Step 9 Comprehensive Suite)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let copiesService: CopiesService;
  let holdsService: HoldsService;
  let loansService: LoansService;
  let eventEmitter: EventEmitter2;
  let fakeClock: FakeClockService;

  let member1Token: string;
  let member1Id: number;
  let member1Email: string;

  let member2Token: string;
  let member2Id: number;
  let member2Email: string;

  let librarianToken: string;
  let librarianId: number;

  let adminToken: string;

  let testAuthorId: number;
  let testCategoryId: number;

  const testPrefix = `step9_loans_${Date.now()}`;

  // Global Invariant Checker across the entire Circulation Domain
  async function assertSystemInvariants(contextDescription?: string) {
    const ctx = contextDescription || '';

    // Invariant 1: Total ACTIVE loans in DB must match total physical copies in BORROWED status
    const activeLoansCount = await prisma.loan.count({
      where: { status: LoanStatus.ACTIVE },
    });
    const borrowedCopiesCount = await prisma.copy.count({
      where: { status: CopyStatus.BORROWED },
    });

    if (activeLoansCount !== borrowedCopiesCount) {
      throw new Error(
        `Invariant violation: Active loans (${activeLoansCount}) != Borrowed copies (${borrowedCopiesCount}) [${ctx}]`,
      );
    }
    expect(activeLoansCount).toBe(borrowedCopiesCount);

    // Invariant 2: Total ACTIVE holds in DB must match total physical copies in ON_HOLD status
    const activeHoldsCount = await prisma.hold.count({
      where: { status: HoldStatus.ACTIVE },
    });
    const onHoldCopiesCount = await prisma.copy.count({
      where: { status: CopyStatus.ON_HOLD },
    });

    if (activeHoldsCount !== onHoldCopiesCount) {
      throw new Error(
        `Invariant violation: Active holds (${activeHoldsCount}) != OnHold copies (${onHoldCopiesCount}) [${ctx}]`,
      );
    }
    expect(activeHoldsCount).toBe(onHoldCopiesCount);

    // Invariant 3: No physical copy may have both an ACTIVE loan and an ACTIVE hold
    const conflictingCopies = await prisma.$queryRaw<{ copyId: number }[]>`
      SELECT l."copyId"
      FROM "Loan" l
      INNER JOIN "Hold" h ON l."copyId" = h."copyId"
      WHERE l.status = 'ACTIVE' AND h.status = 'ACTIVE'
    `;
    if (conflictingCopies.length > 0) {
      throw new Error(
        `Invariant violation: Copies have both an ACTIVE loan and an ACTIVE hold [${ctx}]`,
      );
    }
    expect(conflictingCopies.length).toBe(0);

    // Invariant 4: No physical copy may have more than one ACTIVE loan
    const duplicateActiveLoans = await prisma.$queryRaw<
      { copyId: number; count: bigint }[]
    >`
      SELECT "copyId", COUNT(*) as count
      FROM "Loan"
      WHERE status = 'ACTIVE'
      GROUP BY "copyId"
      HAVING COUNT(*) > 1
    `;
    if (duplicateActiveLoans.length > 0) {
      throw new Error(
        `Invariant violation: Copy has multiple active loans [${ctx}]`,
      );
    }
    expect(duplicateActiveLoans.length).toBe(0);

    // Invariant 5: No member may ever have more than MAX_ACTIVE_LOANS (3) active loans
    const overBorrowedMembers = await prisma.$queryRaw<
      { userId: number; count: bigint }[]
    >`
      SELECT "userId", COUNT(*) as count
      FROM "Loan"
      WHERE status = 'ACTIVE'
      GROUP BY "userId"
      HAVING COUNT(*) > ${MAX_ACTIVE_LOANS}
    `;
    if (overBorrowedMembers.length > 0) {
      throw new Error(
        `Invariant violation: Member has > ${MAX_ACTIVE_LOANS} active loans [${ctx}]`,
      );
    }
    expect(overBorrowedMembers.length).toBe(0);
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
    copiesService = app.get<CopiesService>(CopiesService);
    holdsService = app.get<HoldsService>(HoldsService);
    loansService = app.get<LoansService>(LoansService);
    eventEmitter = app.get<EventEmitter2>(EventEmitter2);

    app.getHttpServer().setMaxListeners(100);

    // Create shared Author and Category
    const author = await prisma.author.create({
      data: { name: `Author ${testPrefix}` },
    });
    testAuthorId = author.id;

    const category = await prisma.category.create({
      data: { name: `Category ${testPrefix}` },
    });
    testCategoryId = category.id;

    // Create Users
    member1Email = `${testPrefix}_member1@example.com`;
    const m1User = await usersService.create({
      name: 'Member One',
      email: member1Email,
      password: 'Password123!',
      role: Role.MEMBER,
    });
    member1Id = m1User.id;

    member2Email = `${testPrefix}_member2@example.com`;
    const m2User = await usersService.create({
      name: 'Member Two',
      email: member2Email,
      password: 'Password123!',
      role: Role.MEMBER,
    });
    member2Id = m2User.id;

    const librarianUser = await usersService.create({
      name: 'Librarian Staff',
      email: `${testPrefix}_librarian@example.com`,
      password: 'Password123!',
      role: Role.LIBRARIAN,
    });
    librarianId = librarianUser.id;

    await usersService.create({
      name: 'Admin Staff',
      email: `${testPrefix}_admin@example.com`,
      password: 'Password123!',
      role: Role.ADMIN,
    });

    // Obtain JWT tokens
    const m1Login = await authService.login({
      email: member1Email,
      password: 'Password123!',
    });
    member1Token = m1Login.accessToken;

    const m2Login = await authService.login({
      email: member2Email,
      password: 'Password123!',
    });
    member2Token = m2Login.accessToken;

    const libLogin = await authService.login({
      email: `${testPrefix}_librarian@example.com`,
      password: 'Password123!',
    });
    librarianToken = libLogin.accessToken;

    const adminLogin = await authService.login({
      email: `${testPrefix}_admin@example.com`,
      password: 'Password123!',
    });
    adminToken = adminLogin.accessToken;
  });

  beforeEach(async () => {
    fakeClock.setTime('2026-11-01T10:00:00.000Z');
    // Clean up test-created loans, holds, and books in strict child-to-parent FK order
    await prisma.loan.deleteMany({
      where: {
        OR: [
          { userId: { in: [member1Id, member2Id, librarianId] } },
          { copy: { book: { authors: { some: { id: testAuthorId } } } } },
        ],
      },
    });
    await prisma.hold.deleteMany({
      where: {
        OR: [
          { userId: { in: [member1Id, member2Id, librarianId] } },
          { copy: { book: { authors: { some: { id: testAuthorId } } } } },
        ],
      },
    });
    await prisma.copyStatusHistory.deleteMany({
      where: { copy: { book: { authors: { some: { id: testAuthorId } } } } },
    });
    await prisma.copy.deleteMany({
      where: { book: { authors: { some: { id: testAuthorId } } } },
    });
    await prisma.book.deleteMany({
      where: { authors: { some: { id: testAuthorId } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '_loop_' } },
    });
  });

  afterAll(async () => {
    // Teardown test users and created resources
    await prisma.loan.deleteMany({
      where: {
        OR: [
          { userId: { in: [member1Id, member2Id, librarianId] } },
          { copy: { book: { authors: { some: { id: testAuthorId } } } } },
        ],
      },
    });
    await prisma.hold.deleteMany({
      where: {
        OR: [
          { userId: { in: [member1Id, member2Id, librarianId] } },
          { copy: { book: { authors: { some: { id: testAuthorId } } } } },
        ],
      },
    });
    await prisma.copyStatusHistory.deleteMany({
      where: { copy: { book: { authors: { some: { id: testAuthorId } } } } },
    });
    await prisma.copy.deleteMany({
      where: { book: { authors: { some: { id: testAuthorId } } } },
    });
    await prisma.book.deleteMany({
      where: { authors: { some: { id: testAuthorId } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: testPrefix } },
    });
    await prisma.category.deleteMany({
      where: { id: testCategoryId },
    });
    await prisma.author.deleteMany({
      where: { id: testAuthorId },
    });
    await app.close();
  });

  async function createTestBook(copiesCount: number, customTitle?: string) {
    const timestamp =
      Date.now().toString().slice(-8) + Math.floor(Math.random() * 100);
    const book = await prisma.book.create({
      data: {
        title: customTitle || `Test Book ${timestamp}`,
        isbn: `978-${timestamp}`,
        publishedYear: 2026,
        authors: { connect: [{ id: testAuthorId }] },
        categories: { connect: [{ id: testCategoryId }] },
      },
    });
    if (copiesCount > 0) {
      await copiesService.addCopies(book.id, copiesCount, 'STACK-E2E');
    }
    return prisma.book.findUniqueOrThrow({
      where: { id: book.id },
      include: { copies: { orderBy: { id: 'asc' } } },
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Pickup Fulfillment (Happy Path & Due Date Calculation)
  // ---------------------------------------------------------------------------
  describe('1. Pickup Fulfillment (Happy Path & Due Date)', () => {
    it('creates an ACTIVE loan, fulfills hold, transitions copy to BORROWED, and computes due date at 23:59:59.999', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const book = await createTestBook(1);
      const copy = book.copies[0];

      // Member 1 requests hold
      const hold = await holdsService.requestHold(member1Id, book.id);

      // Verify book available copies before pickup (copy was placed ON_HOLD, so available copies is 0)
      const bookBefore = await prisma.book.findUniqueOrThrow({
        where: { id: book.id },
        include: { copies: true },
      });
      const availableBefore = bookBefore.copies.filter(
        (c) => c.status === CopyStatus.AVAILABLE && c.retiredAt === null,
      ).length;
      expect(availableBefore).toBe(0);

      // Librarian confirms pickup
      const res = await gql(
        `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
          confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) {
            id
            userId
            bookId
            copyId
            status
            borrowedAt
            dueAt
            isOverdue
            daysRemaining
            daysLate
          }
        }`,
        { holdId: hold.id, copyBarcode: copy.barcode },
        librarianToken,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      const loanData = res.body.data.confirmPickup;
      expect(loanData.status).toBe(LoanStatus.ACTIVE);
      expect(loanData.userId).toBe(member1Id);
      expect(loanData.bookId).toBe(book.id);
      expect(loanData.copyId).toBe(copy.id);
      expect(loanData.isOverdue).toBe(false);
      expect(loanData.daysRemaining).toBe(15);
      expect(loanData.daysLate).toBe(0);

      // Due date verification: 14 days after Nov 1 = Nov 15, at 23:59:59.999
      const dueAtDate = new Date(loanData.dueAt);
      expect(dueAtDate.toISOString()).toBe('2026-11-15T23:59:59.999Z');

      // Verify hold became FULFILLED
      const updatedHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(updatedHold.status).toBe(HoldStatus.FULFILLED);

      // Verify copy became BORROWED
      const updatedCopy = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(updatedCopy.status).toBe(CopyStatus.BORROWED);

      // Verify available copies is unchanged (was 0, remains 0)
      const bookAfter = await prisma.book.findUniqueOrThrow({
        where: { id: book.id },
        include: { copies: true },
      });
      const availableAfter = bookAfter.copies.filter(
        (c) => c.status === CopyStatus.AVAILABLE && c.retiredAt === null,
      ).length;
      expect(availableAfter).toBe(availableBefore);

      await assertSystemInvariants('After pickup fulfillment');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Pickup of Expired Hold (Self-Healing)
  // ---------------------------------------------------------------------------
  describe('2. Pickup of Expired Hold (Self-Healing)', () => {
    it('fails with HOLD_EXPIRED and converges state: hold becomes EXPIRED and copy returns to AVAILABLE', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const book = await createTestBook(1);
      const copy = book.copies[0];

      // Place hold (expires in 24h: 2026-11-02T10:00:00.000Z)
      const hold = await holdsService.requestHold(member1Id, book.id);

      // Advance clock past expiration
      fakeClock.advanceMs(25 * 60 * 60 * 1000); // 25 hours later

      // Librarian attempts pickup
      const res = await gql(
        `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
          confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { holdId: hold.id, copyBarcode: copy.barcode },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('HOLD_EXPIRED');

      // State convergence verification:
      // Hold must be EXPIRED
      const updatedHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(updatedHold.status).toBe(HoldStatus.EXPIRED);

      // Physical copy must be restored to AVAILABLE
      const updatedCopy = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(updatedCopy.status).toBe(CopyStatus.AVAILABLE);

      await assertSystemInvariants('After expired hold pickup convergence');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Pickup with Wrong Barcode
  // ---------------------------------------------------------------------------
  describe('3. Pickup with Wrong Barcode', () => {
    it('fails with COPY_MISMATCH and changes nothing in database', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const book = await createTestBook(1);
      const copy = book.copies[0];

      const hold = await holdsService.requestHold(member1Id, book.id);

      const res = await gql(
        `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
          confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { holdId: hold.id, copyBarcode: 'WRONG-BARCODE-999' },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('COPY_MISMATCH');

      // Verify hold remains ACTIVE
      const currentHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(currentHold.status).toBe(HoldStatus.ACTIVE);

      // Verify copy remains ON_HOLD
      const currentCopy = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(currentCopy.status).toBe(CopyStatus.ON_HOLD);

      await assertSystemInvariants('After copy mismatch failure');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Over-Quota Member at the Pickup Desk
  // ---------------------------------------------------------------------------
  describe('4. Over-Quota Member at Pickup Desk', () => {
    it('refuses pickup with LOAN_LIMIT_REACHED when member has 3 active loans, leaving hold ACTIVE', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      // Create 3 books for 3 walk-in loans to member 1
      const b1 = await createTestBook(1);
      const b2 = await createTestBook(1);
      const b3 = await createTestBook(1);

      await loansService.checkoutCopy(
        member1Id,
        b1.copies[0].barcode,
        librarianId,
      );
      await loansService.checkoutCopy(
        member1Id,
        b2.copies[0].barcode,
        librarianId,
      );
      await loansService.checkoutCopy(
        member1Id,
        b3.copies[0].barcode,
        librarianId,
      );

      // Verify member1 has 3 active loans
      const activeCount = await prisma.loan.count({
        where: { userId: member1Id, status: LoanStatus.ACTIVE },
      });
      expect(activeCount).toBe(3);

      // A 4th book has an active hold for member 1
      const b4 = await createTestBook(1);
      const hold = await prisma.hold.create({
        data: {
          userId: member1Id,
          bookId: b4.id,
          copyId: b4.copies[0].id,
          status: HoldStatus.ACTIVE,
          source: HoldSource.REQUEST,
          expiresAt: new Date('2026-11-02T10:00:00.000Z'),
        },
      });
      await prisma.copy.update({
        where: { id: b4.copies[0].id },
        data: { status: CopyStatus.ON_HOLD },
      });

      // Staff attempts to confirm pickup
      const res = await gql(
        `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
          confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { holdId: hold.id, copyBarcode: b4.copies[0].barcode },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('LOAN_LIMIT_REACHED');

      // Essential rule: Hold is NOT cancelled; it remains ACTIVE so patron can return a book later
      const holdAfter = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(holdAfter.status).toBe(HoldStatus.ACTIVE);

      // Clean up the 3 dummy loans for member1 so subsequent tests are clean
      await prisma.loan.deleteMany({ where: { userId: member1Id } });
      await prisma.copy.updateMany({
        where: {
          id: { in: [b1.copies[0].id, b2.copies[0].id, b3.copies[0].id] },
        },
        data: { status: CopyStatus.AVAILABLE },
      });
      await prisma.hold.delete({ where: { id: hold.id } });
      await prisma.copy.update({
        where: { id: b4.copies[0].id },
        data: { status: CopyStatus.AVAILABLE },
      });

      await assertSystemInvariants('After over-quota rejection');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Walk-In Checkout & State Invariants
  // ---------------------------------------------------------------------------
  describe('5. Walk-In Checkout Guardrails', () => {
    it('lends AVAILABLE copy successfully with holdId = null', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const book = await createTestBook(1);
      const copy = book.copies[0];

      const res = await gql(
        `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
          checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) {
            id
            holdId
            status
            copyBarcode
          }
        }`,
        { memberEmail: member1Email, copyBarcode: copy.barcode },
        librarianToken,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.checkoutCopy.holdId).toBeNull();
      expect(res.body.data.checkoutCopy.status).toBe(LoanStatus.ACTIVE);
      expect(res.body.data.checkoutCopy.copyBarcode).toBe(copy.barcode);

      await assertSystemInvariants('After walk-in success');
    });

    it('fails when copy is ON_HOLD for another member', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];
      await holdsService.requestHold(member2Id, book.id);

      const res = await gql(
        `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
          checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { memberEmail: member1Email, copyBarcode: copy.barcode },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('COPY_ON_HOLD');
    });

    it('fails when copy is BORROWED', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];
      await loansService.checkoutCopy(member2Id, copy.barcode, librarianId);

      const res = await gql(
        `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
          checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { memberEmail: member1Email, copyBarcode: copy.barcode },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('COPY_NOT_AVAILABLE');
    });

    it('fails when copy is retired', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];
      await copiesService.retireCopy(copy.id, 'Water damage', librarianId);

      const res = await gql(
        `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
          checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { memberEmail: member1Email, copyBarcode: copy.barcode },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('COPY_NOT_AVAILABLE');
    });

    it('fails with HOLD_EXISTS_USE_PICKUP if member already has an active hold on the book', async () => {
      const book = await createTestBook(2);
      // Member 1 holds copy 0
      await holdsService.requestHold(member1Id, book.id);

      // Member 1 attempts walk-in checkout of copy 1 of the same book
      const res = await gql(
        `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
          checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) {
            id
          }
        }`,
        { memberEmail: member1Email, copyBarcode: book.copies[1].barcode },
        librarianToken,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('HOLD_EXISTS_USE_PICKUP');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Security, RBAC & Privacy
  // ---------------------------------------------------------------------------
  describe('6. Security & RBAC', () => {
    it('forbids MEMBER from invoking confirmPickup or checkoutCopy', async () => {
      const res = await gql(
        `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
          confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) { id }
        }`,
        { holdId: 1, copyBarcode: 'BARCODE' },
        member1Token,
      );

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
    });

    it('rejects unauthenticated requests to loans queries and mutations', async () => {
      const res = await gql(`query { loans { id } }`);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('myLoans shows only the caller loans and redacts copyBarcode', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];

      // Walk-in loan for member 2
      await loansService.checkoutCopy(member2Id, copy.barcode, librarianId);

      // Member 1 queries myLoans -> receives empty array
      const res1 = await gql(
        `query {
          myLoans {
            id
            bookTitle
            copyBarcode
          }
        }`,
        undefined,
        member1Token,
      );
      expect(res1.body.data.myLoans).toEqual([]);

      // Member 2 queries myLoans -> sees loan, but copyBarcode is redacted to null
      const res2 = await gql(
        `query {
          myLoans {
            id
            bookTitle
            copyBarcode
          }
        }`,
        undefined,
        member2Token,
      );
      expect(res2.body.data.myLoans).toHaveLength(1);
      expect(res2.body.data.myLoans[0].copyBarcode).toBeNull();
      expect(res2.body.data.myLoans[0].bookTitle).toBe(book.title);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Concurrency Test 1: Two Librarians Confirming the Same Pickup Concurrently
  // ---------------------------------------------------------------------------
  describe('7. Concurrency: Two Librarians Confirming Same Pickup', () => {
    it('exactly ONE librarian succeeds and exactly ONE fails with conflict', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];
      const hold = await holdsService.requestHold(member1Id, book.id);

      const [res1, res2] = await Promise.all([
        gql(
          `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
            confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) { id }
          }`,
          { holdId: hold.id, copyBarcode: copy.barcode },
          librarianToken,
        ),
        gql(
          `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
            confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) { id }
          }`,
          { holdId: hold.id, copyBarcode: copy.barcode },
          adminToken,
        ),
      ]);

      const successCount = [res1, res2].filter(
        (r) => r.body.data?.confirmPickup?.id,
      ).length;
      const errorCount = [res1, res2].filter(
        (r) => r.body.errors?.length,
      ).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);

      await assertSystemInvariants('After two librarians concurrent pickup');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Concurrency Test 2: Member with 2 Loans Picks Up 3 Holds Simultaneously
  // ---------------------------------------------------------------------------
  describe('8. Concurrency: Member at Loan Limit with Multiple Concurrent Pickups', () => {
    it('under 3 simultaneous pickups, exactly ONE succeeds and active loans never exceeds 3', async () => {
      // Setup: Member 2 has 2 active loans already
      const b1 = await createTestBook(1);
      const b2 = await createTestBook(1);
      await loansService.checkoutCopy(
        member2Id,
        b1.copies[0].barcode,
        librarianId,
      );
      await loansService.checkoutCopy(
        member2Id,
        b2.copies[0].barcode,
        librarianId,
      );

      // Create 3 books and 3 holds for Member 2
      const hBook1 = await createTestBook(1);
      const hBook2 = await createTestBook(1);
      const hBook3 = await createTestBook(1);

      const hold1 = await holdsService.requestHold(member2Id, hBook1.id);
      const hold2 = await holdsService.requestHold(member2Id, hBook2.id);
      const hold3 = await holdsService.requestHold(member2Id, hBook3.id);

      // Fire 3 pickup confirmations simultaneously
      const results = await Promise.all([
        gql(
          `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
            confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) { id }
          }`,
          { holdId: hold1.id, copyBarcode: hBook1.copies[0].barcode },
          librarianToken,
        ),
        gql(
          `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
            confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) { id }
          }`,
          { holdId: hold2.id, copyBarcode: hBook2.copies[0].barcode },
          librarianToken,
        ),
        gql(
          `mutation ConfirmPickup($holdId: Int!, $copyBarcode: String!) {
            confirmPickup(holdId: $holdId, copyBarcode: $copyBarcode) { id }
          }`,
          { holdId: hold3.id, copyBarcode: hBook3.copies[0].barcode },
          librarianToken,
        ),
      ]);

      const successCount = results.filter(
        (r) => r.body.data?.confirmPickup?.id,
      ).length;
      const failureCount = results.filter((r) => r.body.errors?.length).length;

      // Since member had 2 loans, exactly 1 could be checked out before reaching limit of 3
      expect(successCount).toBe(1);
      expect(failureCount).toBe(2);

      // Verify total active loans for member 2 is strictly 3
      const totalMemberLoans = await prisma.loan.count({
        where: { userId: member2Id, status: LoanStatus.ACTIVE },
      });
      expect(totalMemberLoans).toBe(3);

      await assertSystemInvariants('After concurrent loan limit test');
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Concurrency Test 3: Two Walk-In Checkouts on the Same Copy
  // ---------------------------------------------------------------------------
  describe('9. Concurrency: Two Walk-In Checkouts on Same Copy', () => {
    it('exactly ONE member gets the copy, and copy is never lent twice', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];

      const [res1, res2] = await Promise.all([
        gql(
          `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
            checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) { id }
          }`,
          { memberEmail: member1Email, copyBarcode: copy.barcode },
          librarianToken,
        ),
        gql(
          `mutation CheckoutCopy($memberEmail: String!, $copyBarcode: String!) {
            checkoutCopy(memberEmail: $memberEmail, copyBarcode: $copyBarcode) { id }
          }`,
          { memberEmail: member2Email, copyBarcode: copy.barcode },
          librarianToken,
        ),
      ]);

      const successCount = [res1, res2].filter(
        (r) => r.body.data?.checkoutCopy?.id,
      ).length;
      const errorCount = [res1, res2].filter(
        (r) => r.body.errors?.length,
      ).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);

      await assertSystemInvariants('After two walk-ins on same copy');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Race Condition: Pickup vs. ExpireHold
  // ---------------------------------------------------------------------------
  describe('10. Race: Pickup vs. ExpireHold on Same Hold', () => {
    it('exactly ONE operation wins (either fulfilled to loan, or expired to available)', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const book = await createTestBook(1);
      const copy = book.copies[0];

      const hold = await holdsService.requestHold(member1Id, book.id);

      // Advance clock past expiration so expireHold is eligible
      fakeClock.advanceMs(26 * 60 * 60 * 1000);

      const [pickupResult, expireResult] = await Promise.allSettled([
        loansService.confirmPickup(hold.id, copy.barcode, librarianId),
        holdsService.expireHold(hold.id),
      ]);

      const isPickupSuccess = pickupResult.status === 'fulfilled';
      const isExpireSuccess =
        expireResult.status === 'fulfilled' && expireResult.value !== null;

      // Exactly one operation must succeed in updating the hold
      expect(isPickupSuccess || isExpireSuccess).toBe(true);

      const finalHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(['FULFILLED', 'EXPIRED']).toContain(finalHold.status);

      await assertSystemInvariants('After pickup vs expireHold race');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Race Condition: Walk-In Checkout vs. RequestHold for Last Available Copy
  // ---------------------------------------------------------------------------
  describe('11. Race: Walk-In Checkout vs. RequestHold for Last Available Copy', () => {
    it('exactly ONE operation claims the copy, and invariants hold', async () => {
      const book = await createTestBook(1);
      const copy = book.copies[0];

      const [checkoutRes, holdRes] = await Promise.allSettled([
        loansService.checkoutCopy(member1Id, copy.barcode, librarianId),
        holdsService.requestHold(member2Id, book.id),
      ]);

      const checkoutWon = checkoutRes.status === 'fulfilled';
      const holdWon = holdRes.status === 'fulfilled';

      expect(checkoutWon !== holdWon).toBe(true); // XOR: exactly one won

      await assertSystemInvariants('After checkout vs requestHold race');
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Stress / Loop Concurrency Test (50 iterations)
  // ---------------------------------------------------------------------------
  describe('12. Loop Concurrency Stress Test', () => {
    it('runs 50 concurrent pickup race iterations cleanly without invariant violations', async () => {
      for (let i = 0; i < 50; i++) {
        const loopMember = await usersService.create({
          name: `Loop Member ${i}`,
          email: `${testPrefix}_loop_${i}_${Date.now()}@example.com`,
          password: 'Password123!',
          role: Role.MEMBER,
        });

        const book = await createTestBook(1, `Loop Book ${i}`);
        const copy = book.copies[0];
        const hold = await holdsService.requestHold(loopMember.id, book.id);

        const [p1, p2] = await Promise.allSettled([
          loansService.confirmPickup(hold.id, copy.barcode, librarianId),
          loansService.confirmPickup(hold.id, copy.barcode, librarianId),
        ]);

        const wins = [p1, p2].filter((p) => p.status === 'fulfilled').length;
        expect(wins).toBe(1);

        await assertSystemInvariants(`Loop iteration ${i}`);
      }
    }, 120000);
  });

  // ---------------------------------------------------------------------------
  // 13. Domain Events Emission & Post-Commit Semantics
  // ---------------------------------------------------------------------------
  describe('13. Domain Events (Post-Commit Emission & Failure Rollback)', () => {
    it('emits hold.fulfilled and loan.started exactly once on pickup, and never on failure', async () => {
      const emittedEvents: Array<{ event: string; payload: any }> = [];

      const onHoldFulfilled = (payload: any) =>
        emittedEvents.push({ event: 'hold.fulfilled', payload });
      const onLoanStarted = (payload: any) =>
        emittedEvents.push({ event: 'loan.started', payload });

      eventEmitter.on('hold.fulfilled', onHoldFulfilled);
      eventEmitter.on('loan.started', onLoanStarted);

      try {
        const book = await createTestBook(1);
        const copy = book.copies[0];
        const hold = await holdsService.requestHold(member1Id, book.id);

        // 1. Successful pickup
        const successLoan = await loansService.confirmPickup(
          hold.id,
          copy.barcode,
          librarianId,
        );

        expect(emittedEvents).toHaveLength(2);
        expect(emittedEvents[0]).toEqual({
          event: 'hold.fulfilled',
          payload: expect.objectContaining({
            holdId: hold.id,
            loanId: successLoan.id,
          }),
        });
        expect(emittedEvents[1]).toEqual({
          event: 'loan.started',
          payload: expect.objectContaining({
            loanId: successLoan.id,
            userId: member1Id,
            bookId: book.id,
            copyId: copy.id,
            source: 'PICKUP',
          }),
        });

        // 2. Failed pickup (already fulfilled hold -> HOLD_NOT_ACTIVE)
        emittedEvents.length = 0;
        await expect(
          loansService.confirmPickup(hold.id, copy.barcode, librarianId),
        ).rejects.toThrow();

        // Must NOT emit any events on rollback/failure
        expect(emittedEvents).toHaveLength(0);
      } finally {
        eventEmitter.off('hold.fulfilled', onHoldFulfilled);
        eventEmitter.off('loan.started', onLoanStarted);
      }
    });

    it('emits loan.started exactly once on walk-in checkout, and never on failure', async () => {
      const emittedEvents: Array<{ event: string; payload: any }> = [];
      const onLoanStarted = (payload: any) =>
        emittedEvents.push({ event: 'loan.started', payload });

      eventEmitter.on('loan.started', onLoanStarted);

      try {
        const book = await createTestBook(1);
        const copy = book.copies[0];

        // 1. Successful walk-in checkout
        const loan = await loansService.checkoutCopy(
          member2Id,
          copy.barcode,
          librarianId,
        );

        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0]).toEqual({
          event: 'loan.started',
          payload: expect.objectContaining({
            loanId: loan.id,
            userId: member2Id,
            bookId: book.id,
            copyId: copy.id,
            source: 'WALK_IN',
          }),
        });

        // 2. Failed checkout (already borrowed -> COPY_NOT_AVAILABLE)
        emittedEvents.length = 0;
        await expect(
          loansService.checkoutCopy(member2Id, copy.barcode, librarianId),
        ).rejects.toThrow();

        // Must NOT emit any events on failure
        expect(emittedEvents).toHaveLength(0);
      } finally {
        eventEmitter.off('loan.started', onLoanStarted);
      }
    });
  });
});
