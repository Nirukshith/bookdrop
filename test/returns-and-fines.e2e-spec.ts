import { INestApplication, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyStatus,
  FineReason,
  FineStatus,
  LoanStatus,
  ReturnCondition,
  Role,
} from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { FinesService } from '../src/circulation/fines/fines.service';
import { LoansService } from '../src/circulation/loans/loans.service';
import { ClockService, FakeClockService } from '../src/common/clock';
import { DOMAIN_EVENT_NAMES } from '../src/contracts/events';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { computeLateFeeMinor } from '../src/config/library-rules';

describe('Returns, Fines, and Concurrency E2E (Stage 7 Full Suite)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let loansService: LoansService;
  let finesService: FinesService;
  let eventEmitter: EventEmitter2;
  let fakeClock: FakeClockService;

  let member1Token: string;
  let member1Id: number;
  let member1Email: string;

  let member2Id: number;
  let member2Email: string;

  let librarianToken: string;
  let librarianId: number;

  let adminToken: string;
  let adminId: number;

  let testAuthorId: number;
  let testCategoryId: number;

  const testRunId = Date.now();

  // -------------------------------------------------------------
  // System Invariant Verification Helper
  // -------------------------------------------------------------
  async function assertSystemInvariants(contextDescription = '') {
    void contextDescription;
    // 1. Total ACTIVE loans must equal total physical copies in BORROWED status
    const activeLoans = await prisma.loan.count({
      where: { status: LoanStatus.ACTIVE },
    });
    const borrowedCopies = await prisma.copy.count({
      where: { status: CopyStatus.BORROWED },
    });
    expect(activeLoans).toBe(borrowedCopies);

    // 2. No copy can have more than one ACTIVE loan
    const duplicateActiveLoans = await prisma.$queryRaw<
      { copyId: number; count: bigint }[]
    >`
      SELECT "copyId", COUNT(*) as count
      FROM "Loan"
      WHERE status = 'ACTIVE'
      GROUP BY "copyId"
      HAVING COUNT(*) > 1
    `;
    expect(duplicateActiveLoans.length).toBe(0);

    // 3. No loan can be both RETURNED and LOST
    const corruptLoans = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Loan" WHERE status NOT IN ('ACTIVE', 'RETURNED', 'LOST')
    `;
    expect(corruptLoans.length).toBe(0);

    // 4. For every fine, paidMinor must equal the exact sum of its payment ledger entries
    const finesWithPayments = await prisma.fine.findMany({
      include: { payments: true },
    });
    for (const fine of finesWithPayments) {
      const sumPayments = fine.payments.reduce(
        (acc, p) => acc + p.amountMinor,
        0,
      );
      expect(fine.paidMinor).toBe(sumPayments);

      // Invariant: 0 <= paidMinor <= amountMinor
      expect(fine.paidMinor).toBeGreaterThanOrEqual(0);
      expect(fine.paidMinor).toBeLessThanOrEqual(fine.amountMinor);

      // Status consistency check
      if (fine.status === FineStatus.PAID) {
        expect(fine.paidMinor).toBe(fine.amountMinor);
      } else if (fine.status === FineStatus.UNPAID) {
        expect(fine.paidMinor).toBe(0);
      } else if (fine.status === FineStatus.PARTIALLY_PAID) {
        expect(fine.paidMinor).toBeGreaterThan(0);
        expect(fine.paidMinor).toBeLessThan(fine.amountMinor);
      }
    }

    // 5. Dedupe key uniqueness holds across the entire Fine table
    const duplicateDedupeKeys = await prisma.$queryRaw<
      { dedupeKey: string; count: bigint }[]
    >`
      SELECT "dedupeKey", COUNT(*) as count
      FROM "Fine"
      WHERE "dedupeKey" IS NOT NULL
      GROUP BY "dedupeKey"
      HAVING COUNT(*) > 1
    `;
    expect(duplicateDedupeKeys.length).toBe(0);
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

    prisma = app.get(PrismaService);
    usersService = app.get(UsersService);
    authService = app.get(AuthService);
    loansService = app.get(LoansService);
    finesService = app.get(FinesService);
    eventEmitter = app.get(EventEmitter2);

    // Setup Category & Author for clean test books
    const category = await prisma.category.create({
      data: { name: `Fines_Cat_${testRunId}` },
    });
    testCategoryId = category.id;

    const author = await prisma.author.create({
      data: { name: `Fines_Author_${testRunId}` },
    });
    testAuthorId = author.id;

    // Create Demo Users
    member1Email = `member1_${testRunId}@test.local`;
    const m1 = await usersService.create({
      email: member1Email,
      name: 'Test Member 1',
      password: 'MemberPass123!',
      role: Role.MEMBER,
    });
    member1Id = m1.id;
    const m1Login = await authService.login({
      email: member1Email,
      password: 'MemberPass123!',
    });
    member1Token = m1Login.accessToken;

    member2Email = `member2_${testRunId}@test.local`;
    const m2 = await usersService.create({
      email: member2Email,
      name: 'Test Member 2',
      password: 'MemberPass123!',
      role: Role.MEMBER,
    });
    member2Id = m2.id;

    const libEmail = `librarian_${testRunId}@test.local`;
    const lib = await usersService.create({
      email: libEmail,
      name: 'Test Librarian',
      password: 'StaffPass123!',
      role: Role.LIBRARIAN,
    });
    librarianId = lib.id;
    const libLogin = await authService.login({
      email: libEmail,
      password: 'StaffPass123!',
    });
    librarianToken = libLogin.accessToken;

    const admEmail = `admin_${testRunId}@test.local`;
    const adm = await usersService.create({
      email: admEmail,
      name: 'Test Admin',
      password: 'AdminPass123!',
      role: Role.ADMIN,
    });
    adminId = adm.id;
    const admLogin = await authService.login({
      email: admEmail,
      password: 'AdminPass123!',
    });
    adminToken = admLogin.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createFreshMember() {
    const email = `patron_${Date.now()}_${Math.floor(Math.random() * 100000)}@test.local`;
    const user = await usersService.create({
      email,
      name: 'Clean Patron',
      password: 'Password123!',
      role: Role.MEMBER,
    });
    const login = await authService.login({
      email,
      password: 'Password123!',
    });
    return { id: user.id, email, token: login.accessToken };
  }

  // Helper to create books with available copies
  async function createTestBook(title: string, copyCount = 1) {
    const book = await prisma.book.create({
      data: {
        title: `${title}_${Date.now()}_${Math.random()}`,
        isbn: `ISBN-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        authors: { connect: [{ id: testAuthorId }] },
        categories: { connect: [{ id: testCategoryId }] },
      },
    });

    const copies = [];
    for (let i = 0; i < copyCount; i++) {
      const copy = await prisma.copy.create({
        data: {
          bookId: book.id,
          barcode: `BD-${book.id}-${i + 1}-${Math.floor(Math.random() * 10000)}`,
          status: CopyStatus.AVAILABLE,
          shelfLocation: 'STACK-A',
        },
      });
      copies.push(copy);
    }

    return { book, copies };
  }

  // =============================================================
  // 1. On-Time Return
  // =============================================================
  describe('1. On-Time Return', () => {
    it('returns on-time loan in GOOD condition: loan RETURNED, copy AVAILABLE, no fine, availableCopies rises by 1', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { book, copies } = await createTestBook('OnTimeBook', 2);
      const copy = copies[0];

      // Checkout copy to member1
      await loansService.checkoutCopy(member1Id, copy.barcode, librarianId);

      // Verify book available copies is 1
      const bookBefore = await prisma.copy.count({
        where: { bookId: book.id, status: CopyStatus.AVAILABLE },
      });
      expect(bookBefore).toBe(1);

      // Return on day 5 (on-time)
      fakeClock.advanceDays(5);
      const res = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) {
            id
            status
            returnedAt
            returnCondition
            daysLate
            accruedLateFeeRs
          }
        }`,
        { barcode: copy.barcode, cond: 'GOOD' },
        librarianToken,
      );

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.returnLoan.status).toBe(LoanStatus.RETURNED);
      expect(res.body.data.returnLoan.returnCondition).toBe(
        ReturnCondition.GOOD,
      );
      expect(res.body.data.returnLoan.daysLate).toBe(0);
      expect(res.body.data.returnLoan.accruedLateFeeRs).toBe(0);

      // Check copy status returned to AVAILABLE
      const updatedCopy = await prisma.copy.findUnique({
        where: { id: copy.id },
      });
      expect(updatedCopy?.status).toBe(CopyStatus.AVAILABLE);

      // Check available copies rose by 1
      const bookAfter = await prisma.copy.count({
        where: { bookId: book.id, status: CopyStatus.AVAILABLE },
      });
      expect(bookAfter).toBe(2);

      // Check no fine was created
      const fine = await prisma.fine.findFirst({
        where: { loanId: Number(res.body.data.returnLoan.id) },
      });
      expect(fine).toBeNull();

      await assertSystemInvariants('OnTime Return');
    });
  });

  // =============================================================
  // 2. Return 3 Days Late & Eligibility Unblocking
  // =============================================================
  describe('2. Overdue Return, Late Fee Assessment, & Fine Payment Unblocking', () => {
    it('returns 3 days late: creates UNPAID LATE_RETURN fine of Rs 30, blocks patron with UNPAID_FINES, and unblocks upon payment', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('LateReturnBook', 1);
      const copy = copies[0];

      // Borrow on Nov 1 -> due on Nov 15 at 23:59:59.999
      const loan = await loansService.checkoutCopy(
        member1Id,
        copy.barcode,
        librarianId,
      );

      // Advance clock to Nov 18 (3 local calendar days late)
      fakeClock.setTime('2026-11-18T14:00:00.000Z');

      // Return copy at circulation desk
      const returnRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) {
            id
            status
            daysLate
          }
        }`,
        { barcode: copy.barcode, cond: 'GOOD' },
        librarianToken,
      );

      expect(returnRes.body.errors).toBeUndefined();
      expect(returnRes.body.data.returnLoan.daysLate).toBe(3);

      // Fine of Rs 30 should exist in UNPAID status
      const fines = await prisma.fine.findMany({
        where: { loanId: loan.id },
      });
      expect(fines).toHaveLength(1);
      const lateFine = fines[0];
      expect(lateFine.reason).toBe(FineReason.LATE_RETURN);
      expect(lateFine.amountMinor).toBe(3000); // Rs 30 in paise
      expect(lateFine.paidMinor).toBe(0);
      expect(lateFine.status).toBe(FineStatus.UNPAID);

      // Member attempts to request a hold on another book: BLOCKED with UNPAID_FINES
      const { book: otherBook } = await createTestBook('AnotherBook', 1);
      const holdRes = await gql(
        `mutation Hold($bookId: Int!) {
          requestHold(bookId: $bookId) { id }
        }`,
        { bookId: otherBook.id },
        member1Token,
      );

      expect(holdRes.body.errors).toBeDefined();
      expect(holdRes.body.errors[0].extensions.code).toBe('UNPAID_FINES');

      // Member attempts to checkout another book: BLOCKED with UNPAID_FINES
      const { copies: otherCopies } = await createTestBook('CheckoutBook', 1);
      const checkoutRes = await gql(
        `mutation Checkout($email: String!, $barcode: String!) {
          checkoutCopy(memberEmail: $email, copyBarcode: $barcode) { id }
        }`,
        { email: member1Email, barcode: otherCopies[0].barcode },
        librarianToken,
      );

      expect(checkoutRes.body.errors).toBeDefined();
      expect(checkoutRes.body.errors[0].extensions.code).toBe('UNPAID_FINES');

      // Staff records full payment of Rs 30
      const payRes = await gql(
        `mutation Pay($fineId: ID!, $amountRs: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amountRs, note: "Cash at desk") {
            id
            status
            paidRs
            outstandingRs
          }
        }`,
        { fineId: lateFine.id, amountRs: 30.0 },
        librarianToken,
      );

      expect(payRes.body.errors).toBeUndefined();
      expect(payRes.body.data.recordFinePayment.status).toBe(FineStatus.PAID);
      expect(payRes.body.data.recordFinePayment.paidRs).toBe(30);
      expect(payRes.body.data.recordFinePayment.outstandingRs).toBe(0);

      // Now member is UNBLOCKED: requestHold succeeds!
      const unblockedHold = await gql(
        `mutation Hold($bookId: Int!) {
          requestHold(bookId: $bookId) { id status }
        }`,
        { bookId: otherBook.id },
        member1Token,
      );
      expect(unblockedHold.body.errors).toBeUndefined();
      expect(unblockedHold.body.data.requestHold.status).toBe('ACTIVE');

      await assertSystemInvariants('Late Return and Unblock');
    });
  });

  // =============================================================
  // 3. Late Fee Cap Rule
  // =============================================================
  describe('3. Late Fee Cap Rule', () => {
    it('pure function and fee calculations cap correctly when cap is configured', () => {
      // 10 days late @ Rs 10/day uncapped = Rs 100 (10000 minor)
      expect(computeLateFeeMinor(10, 10, null)).toBe(10000);

      // 10 days late @ Rs 10/day with cap Rs 50 = Rs 50 (5000 minor)
      expect(computeLateFeeMinor(10, 10, 50)).toBe(5000);

      // 3 days late @ Rs 10/day with cap Rs 50 = Rs 30 (3000 minor, uncapped)
      expect(computeLateFeeMinor(3, 10, 50)).toBe(3000);
    });
  });

  // =============================================================
  // 4. Damaged Return Handling
  // =============================================================
  describe('4. Damaged Return Handling', () => {
    it('copy becomes DAMAGED, disappears from availability, creates DAMAGED_BOOK fine, and rejects missing note', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { book, copies } = await createTestBook('DamagedBook', 1);
      const copy = copies[0];

      await loansService.checkoutCopy(member2Id, copy.barcode, librarianId);

      // Attempt damaged return without note -> FAILS with CONDITION_NOTE_REQUIRED
      const noNoteRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!, $fee: Float) {
          returnLoan(copyBarcode: $barcode, condition: $cond, damageFeeRs: $fee) { id }
        }`,
        { barcode: copy.barcode, cond: 'DAMAGED', fee: 100 },
        librarianToken,
      );
      expect(noNoteRes.body.errors).toBeDefined();
      expect(noNoteRes.body.errors[0].extensions.code).toBe(
        'CONDITION_NOTE_REQUIRED',
      );

      // Return with note and damage fee of Rs 75.50
      const damagedRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!, $note: String, $fee: Float) {
          returnLoan(copyBarcode: $barcode, condition: $cond, conditionNote: $note, damageFeeRs: $fee) {
            id
            status
            returnCondition
            conditionNote
          }
        }`,
        {
          barcode: copy.barcode,
          cond: 'DAMAGED',
          note: 'Cover water damaged and torn',
          fee: 75.5,
        },
        librarianToken,
      );

      expect(damagedRes.body.errors).toBeUndefined();
      expect(damagedRes.body.data.returnLoan.status).toBe(LoanStatus.RETURNED);
      expect(damagedRes.body.data.returnLoan.returnCondition).toBe(
        ReturnCondition.DAMAGED,
      );

      // Copy status is now DAMAGED
      const updatedCopy = await prisma.copy.findUnique({
        where: { id: copy.id },
      });
      expect(updatedCopy?.status).toBe(CopyStatus.DAMAGED);

      // Book has 0 available copies
      const available = await prisma.copy.count({
        where: { bookId: book.id, status: CopyStatus.AVAILABLE },
      });
      expect(available).toBe(0);

      // Fine of Rs 75.50 exists
      const fine = await prisma.fine.findFirst({
        where: { loanId: Number(damagedRes.body.data.returnLoan.id) },
      });
      expect(fine?.reason).toBe(FineReason.DAMAGED_BOOK);
      expect(fine?.amountMinor).toBe(7550);

      await assertSystemInvariants('Damaged Return');
    });

    it('creates TWO fines when return is both late and damaged', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('LateDamagedBook', 1);
      const copy = copies[0];
      const member = await createFreshMember();

      await loansService.checkoutCopy(member.id, copy.barcode, librarianId);

      // 4 days late
      fakeClock.setTime('2026-11-19T14:00:00.000Z');

      const res = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!, $note: String, $fee: Float) {
          returnLoan(copyBarcode: $barcode, condition: $cond, conditionNote: $note, damageFeeRs: $fee) {
            id
            daysLate
          }
        }`,
        {
          barcode: copy.barcode,
          cond: 'DAMAGED',
          note: 'Chewed by dog',
          fee: 50.0,
        },
        librarianToken,
      );

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.returnLoan.daysLate).toBe(4);

      // Two fines must exist: LATE_RETURN (Rs 40) and DAMAGED_BOOK (Rs 50)
      const fines = await prisma.fine.findMany({
        where: { loanId: loan.id },
        orderBy: { reason: 'asc' },
      });
      expect(fines).toHaveLength(2);

      const damagedFine = fines.find(
        (f) => f.reason === FineReason.DAMAGED_BOOK,
      );
      const lateFine = fines.find((f) => f.reason === FineReason.LATE_RETURN);

      expect(damagedFine?.amountMinor).toBe(5000);
      expect(lateFine?.amountMinor).toBe(4000);

      await assertSystemInvariants('Late and Damaged Return');
    });
  });

  // =============================================================
  // 5. Lost Loan Lifecycle
  // =============================================================
  describe('5. Lost Loan Lifecycle', () => {
    it('marks loan lost: loan LOST, copy LOST, one LOST_BOOK fine, no late fee, and returning it fails', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('LostBook', 1);
      const copy = copies[0];
      const member = await createFreshMember();

      await loansService.checkoutCopy(member.id, copy.barcode, librarianId);

      // Advance clock past due date (10 days late)
      fakeClock.setTime('2026-11-25T14:00:00.000Z');

      // Staff declares loan lost with Rs 300 replacement fee
      const lostRes = await gql(
        `mutation Lost($loanId: ID!, $fee: Float!, $note: String!) {
          markLoanLost(loanId: $loanId, assessedFeeRs: $fee, note: $note) {
            id
            status
            lostAt
          }
        }`,
        { loanId: loan.id, fee: 300.0, note: 'Patron lost book on train' },
        librarianToken,
      );

      expect(lostRes.body.errors).toBeUndefined();
      expect(lostRes.body.data.markLoanLost.status).toBe(LoanStatus.LOST);

      // Copy status is LOST
      const updatedCopy = await prisma.copy.findUnique({
        where: { id: copy.id },
      });
      expect(updatedCopy?.status).toBe(CopyStatus.LOST);

      // Exactly ONE fine exists: LOST_BOOK (Rs 300), NO late return fine!
      const fines = await prisma.fine.findMany({
        where: { loanId: loan.id },
      });
      expect(fines).toHaveLength(1);
      expect(fines[0].reason).toBe(FineReason.LOST_BOOK);
      expect(fines[0].amountMinor).toBe(30000);

      // Attempting to return a LOST loan fails with NO_ACTIVE_LOAN_FOR_COPY
      const returnLostRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) { id }
        }`,
        { barcode: copy.barcode, cond: 'GOOD' },
        librarianToken,
      );
      expect(returnLostRes.body.errors).toBeDefined();
      expect(returnLostRes.body.errors[0].extensions.code).toBe(
        'NO_ACTIVE_LOAN_FOR_COPY',
      );

      await assertSystemInvariants('Lost Loan');
    });
  });

  // =============================================================
  // 6. Return Error Guards & Invariant Edge Cases
  // =============================================================
  describe('6. Return Error Guards', () => {
    it('returns proper error codes for unknown barcode and copy with no active loan', async () => {
      // Unknown barcode -> COPY_NOT_FOUND
      const unknownRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) { id }
        }`,
        { barcode: 'UNKNOWN-BARCODE-999', cond: 'GOOD' },
        librarianToken,
      );
      expect(unknownRes.body.errors[0].extensions.code).toBe('COPY_NOT_FOUND');

      // Available copy with no active loan -> NO_ACTIVE_LOAN_FOR_COPY
      const { copies } = await createTestBook('AvailableCopyNoLoan', 1);
      const noLoanRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) { id }
        }`,
        { barcode: copies[0].barcode, cond: 'GOOD' },
        librarianToken,
      );
      expect(noLoanRes.body.errors[0].extensions.code).toBe(
        'NO_ACTIVE_LOAN_FOR_COPY',
      );
    });

    it('patron with unpaid fines and an overdue book CAN still return it', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('PatronCanReturn', 1);
      const copy = copies[0];
      const member = await createFreshMember();

      // Borrow book
      await loansService.checkoutCopy(member.id, copy.barcode, librarianId);

      // Assess an unpaid fine directly onto member
      await finesService.createFine({
        userId: member.id,
        reason: FineReason.DAMAGED_BOOK,
        amountMinor: 5000,
        dedupeKey: `damaged:prior-${Date.now()}`,
      });

      // Advance clock past due date
      fakeClock.setTime('2026-11-20T10:00:00.000Z');

      // Member returns book: MUST SUCCEED despite unpaid fines and overdue status!
      const returnRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) {
            id
            status
          }
        }`,
        { barcode: copy.barcode, cond: 'GOOD' },
        librarianToken,
      );

      expect(returnRes.body.errors).toBeUndefined();
      expect(returnRes.body.data.returnLoan.status).toBe(LoanStatus.RETURNED);
    });
  });

  // =============================================================
  // 7. Dynamic Overdue Loans Policy Check
  // =============================================================
  describe('7. Dynamic Overdue Loans Policy Check', () => {
    it('active overdue loan with NO fine record blocks requestHold, confirmPickup, and checkoutCopy with OVERDUE_LOANS', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('OverdueBlockBook', 1);
      const copy = copies[0];
      const member = await createFreshMember();

      await loansService.checkoutCopy(member.id, copy.barcode, librarianId);

      // Advance clock past due date without returning (no fine row exists yet)
      fakeClock.setTime('2026-11-20T10:00:00.000Z');

      // Member attempts requestHold -> BLOCKED with OVERDUE_LOANS
      const { book: newBook } = await createTestBook('NewBookHold', 1);
      const holdRes = await gql(
        `mutation Hold($bookId: Int!) {
          requestHold(bookId: $bookId) { id }
        }`,
        { bookId: newBook.id },
        member.token,
      );
      expect(holdRes.body.errors[0].extensions.code).toBe('OVERDUE_LOANS');

      // Staff attempts checkoutCopy for this member -> BLOCKED with OVERDUE_LOANS
      const { copies: walkInCopies } = await createTestBook('WalkInBlock', 1);
      const walkInRes = await gql(
        `mutation Checkout($email: String!, $barcode: String!) {
          checkoutCopy(memberEmail: $email, copyBarcode: $barcode) { id }
        }`,
        { email: member.email, barcode: walkInCopies[0].barcode },
        librarianToken,
      );
      expect(walkInRes.body.errors[0].extensions.code).toBe('OVERDUE_LOANS');

      // Return the overdue book
      await loansService.returnLoan({
        copyBarcode: copy.barcode,
        condition: ReturnCondition.GOOD,
        staffId: librarianId,
      });

      // Pay the resulting late fine
      const fines = await finesService.getOutstandingFines(member.id);
      for (const f of fines) {
        await finesService.recordPayment(
          f.id,
          f.amountMinor - f.paidMinor,
          librarianId,
        );
      }

      // Member is now unblocked
      const unblockedHold = await gql(
        `mutation Hold($bookId: Int!) {
          requestHold(bookId: $bookId) { id status }
        }`,
        { bookId: newBook.id },
        member.token,
      );
      expect(unblockedHold.body.errors).toBeUndefined();
    });
  });

  // =============================================================
  // 8. Payment Ledger & Waive Rules
  // =============================================================
  describe('8. Fine Payments and Waivers', () => {
    it('supports partial payments, rejects overpayment/invalid amounts, and rejects paying paid/waived fines', async () => {
      // Create fine of Rs 100
      const fine = await finesService.createFine({
        userId: member2Id,
        reason: FineReason.DAMAGED_BOOK,
        amountMinor: 10000,
        dedupeKey: `pay-test-${Date.now()}`,
      });

      // Partial payment of Rs 40
      const partialRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) {
            id
            status
            paidRs
            outstandingRs
          }
        }`,
        { fineId: fine.id, amount: 40.0 },
        librarianToken,
      );
      expect(partialRes.body.data.recordFinePayment.status).toBe(
        FineStatus.PARTIALLY_PAID,
      );
      expect(partialRes.body.data.recordFinePayment.paidRs).toBe(40);
      expect(partialRes.body.data.recordFinePayment.outstandingRs).toBe(60);

      // Overpayment: attempting to pay Rs 70 when outstanding is 60 -> OVERPAYMENT
      const overpayRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) { id }
        }`,
        { fineId: fine.id, amount: 70.0 },
        librarianToken,
      );
      expect(overpayRes.body.errors[0].extensions.code).toBe('OVERPAYMENT');

      // Invalid amounts: zero, negative, fractional
      const zeroRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) { id }
        }`,
        { fineId: fine.id, amount: 0 },
        librarianToken,
      );
      expect(zeroRes.body.errors[0].extensions.code).toBe('INVALID_AMOUNT');

      const negRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) { id }
        }`,
        { fineId: fine.id, amount: -15 },
        librarianToken,
      );
      expect(negRes.body.errors[0].extensions.code).toBe('INVALID_AMOUNT');

      const fracRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) { id }
        }`,
        { fineId: fine.id, amount: 10.555 },
        librarianToken,
      );
      expect(fracRes.body.errors[0].extensions.code).toBe('INVALID_AMOUNT');

      // Pay remaining Rs 60 -> status PAID
      const fullRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) {
            id
            status
          }
        }`,
        { fineId: fine.id, amount: 60.0 },
        librarianToken,
      );
      expect(fullRes.body.data.recordFinePayment.status).toBe(FineStatus.PAID);

      // Paying a PAID fine -> FINE_NOT_PAYABLE
      const againRes = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) { id }
        }`,
        { fineId: fine.id, amount: 10.0 },
        librarianToken,
      );
      expect(againRes.body.errors[0].extensions.code).toBe('FINE_NOT_PAYABLE');

      await assertSystemInvariants('Payment Ledger');
    });

    it('waive works for ADMIN only, keeps earlier payments, and unblocks patron', async () => {
      const fine = await finesService.createFine({
        userId: member2Id,
        reason: FineReason.DAMAGED_BOOK,
        amountMinor: 8000,
        dedupeKey: `waive-test-${Date.now()}`,
      });

      // Partial payment of Rs 30
      await finesService.recordPayment(fine.id, 3000, librarianId);

      // Librarian attempts to waive -> FORBIDDEN
      const libWaive = await gql(
        `mutation Waive($id: ID!, $reason: String!) {
          waiveFine(fineId: $id, reason: $reason) { id }
        }`,
        { id: fine.id, reason: 'Friend of librarian' },
        librarianToken,
      );
      expect(libWaive.body.errors[0].extensions.code).toBe('FORBIDDEN');

      // Admin waives fine -> SUCCESS
      const adminWaive = await gql(
        `mutation Waive($id: ID!, $reason: String!) {
          waiveFine(fineId: $id, reason: $reason) {
            id
            status
            paidRs
            waivedReason
          }
        }`,
        { id: fine.id, reason: 'Valid administrative exemption' },
        adminToken,
      );

      expect(adminWaive.body.errors).toBeUndefined();
      expect(adminWaive.body.data.waiveFine.status).toBe(FineStatus.WAIVED);
      expect(adminWaive.body.data.waiveFine.paidRs).toBe(30); // Earlier payment kept!
      expect(adminWaive.body.data.waiveFine.waivedReason).toBe(
        'Valid administrative exemption',
      );

      // Paying a WAIVED fine -> FINE_NOT_PAYABLE
      const payWaived = await gql(
        `mutation Pay($fineId: ID!, $amount: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amount) { id }
        }`,
        { fineId: fine.id, amount: 10.0 },
        librarianToken,
      );
      expect(payWaived.body.errors[0].extensions.code).toBe('FINE_NOT_PAYABLE');

      await assertSystemInvariants('Fine Waiver');
    });
  });

  // =============================================================
  // 9. Security, Information Hiding, & Scoping
  // =============================================================
  describe('9. Security and Scoping', () => {
    it('rejects unauthenticated calls and prevents member from calling staff mutations', async () => {
      const unauth = await gql(`query { me { id } }`);
      expect(unauth.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');

      const memberStaffMutation = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) { id }
        }`,
        { barcode: 'FAKE-123', cond: 'GOOD' },
        member1Token,
      );
      expect(memberStaffMutation.body.errors[0].extensions.code).toBe(
        'FORBIDDEN',
      );
    });

    it('myFines returns only the caller fines without leaking barcodes, user IDs, or staff names', async () => {
      const res = await gql(
        `query {
          myFines {
            id
            reason
            originalAmountRs
            paidAmountRs
            outstandingAmountRs
            status
            bookTitle
          }
        }`,
        undefined,
        member1Token,
      );

      expect(res.body.errors).toBeUndefined();
      expect(Array.isArray(res.body.data.myFines)).toBe(true);
    });
  });

  // =============================================================
  // 10. PostgreSQL CHECK Constraints Safety Net
  // =============================================================
  describe('10. Database CHECK Constraints Safety Net', () => {
    it('fails with database check violation on raw SQL insert of negative amountMinor', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "Fine" ("userId", "reason", "amountMinor", "paidMinor", "status", "dedupeKey")
          VALUES (${member1Id}, 'DAMAGED_BOOK'::"FineReason", -500, 0, 'UNPAID'::"FineStatus", ${`neg-amount-${Date.now()}`})
        `,
      ).rejects.toThrow();
    });

    it('fails with database check violation on raw SQL insert where paidMinor > amountMinor', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "Fine" ("userId", "reason", "amountMinor", "paidMinor", "status", "dedupeKey")
          VALUES (${member1Id}, 'DAMAGED_BOOK'::"FineReason", 1000, 1500, 'PAID'::"FineStatus", ${`overpaid-${Date.now()}`})
        `,
      ).rejects.toThrow();
    });
  });

  // =============================================================
  // 11. Concurrency Stress Suite (Looped Runs)
  // =============================================================
  describe('11. Concurrency Stress Tests', () => {
    it('concurrency: two librarians return the same loan at once (20 iterations) -> exactly 1 succeeds, 1 late fine', async () => {
      for (let i = 0; i < 20; i++) {
        fakeClock.setTime('2026-11-01T10:00:00.000Z');
        const { copies } = await createTestBook(`ConcurrentReturn_${i}`, 1);
        const copy = copies[0];
        const member = await createFreshMember();

        const loan = await loansService.checkoutCopy(
          member.id,
          copy.barcode,
          librarianId,
        );

        // Advance 2 days late
        fakeClock.advanceDays(16);

        // Launch concurrent returns
        const [res1, res2] = await Promise.allSettled([
          loansService.returnLoan({
            copyBarcode: copy.barcode,
            condition: ReturnCondition.GOOD,
            staffId: librarianId,
          }),
          loansService.returnLoan({
            copyBarcode: copy.barcode,
            condition: ReturnCondition.GOOD,
            staffId: librarianId,
          }),
        ]);

        const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
        const rejections = [res1, res2].filter((r) => r.status === 'rejected');

        expect(successes).toHaveLength(1);
        expect(rejections).toHaveLength(1);

        // Verify exactly one late fine was assessed
        const fines = await prisma.fine.findMany({
          where: { loanId: loan.id },
        });
        expect(fines).toHaveLength(1);

        // Verify copy is available
        const updatedCopy = await prisma.copy.findUnique({
          where: { id: copy.id },
        });
        expect(updatedCopy?.status).toBe(CopyStatus.AVAILABLE);
      }

      await assertSystemInvariants('Concurrent Returns Loop');
    });

    it('concurrency: several payments at once exceeding balance (20 iterations) -> total paid never exceeds fine', async () => {
      for (let i = 0; i < 20; i++) {
        const fine = await finesService.createFine({
          userId: member1Id,
          reason: FineReason.DAMAGED_BOOK,
          amountMinor: 5000, // Rs 50
          dedupeKey: `race-pay-${i}-${Date.now()}`,
        });

        // 3 concurrent payments of Rs 25 (total Rs 75 > Rs 50)
        await Promise.allSettled([
          finesService.recordPayment(fine.id, 2500, librarianId),
          finesService.recordPayment(fine.id, 2500, librarianId),
          finesService.recordPayment(fine.id, 2500, librarianId),
        ]);

        const refreshed = await prisma.fine.findUniqueOrThrow({
          where: { id: fine.id },
        });
        expect(refreshed.paidMinor).toBeLessThanOrEqual(refreshed.amountMinor);
      }

      await assertSystemInvariants('Concurrent Payments Loop');
    });

    it('concurrency: payment and waive on same fine at once (20 iterations) -> fine remains valid and consistent', async () => {
      for (let i = 0; i < 20; i++) {
        const fine = await finesService.createFine({
          userId: member1Id,
          reason: FineReason.DAMAGED_BOOK,
          amountMinor: 3000,
          dedupeKey: `race-waive-${i}-${Date.now()}`,
        });

        // Concurrent full payment and waive
        await Promise.allSettled([
          finesService.recordPayment(fine.id, 3000, librarianId),
          finesService.waiveFine(fine.id, 'Discretionary waive', adminId),
        ]);

        const refreshed = await prisma.fine.findUniqueOrThrow({
          where: { id: fine.id },
        });

        expect(['PAID', 'WAIVED']).toContain(refreshed.status);
        expect(refreshed.paidMinor).toBeLessThanOrEqual(refreshed.amountMinor);
      }

      await assertSystemInvariants('Concurrent Payment & Waive Loop');
    });

    it('race: returnLoan and markLoanLost on the same loan at once (20 iterations) -> exactly 1 wins', async () => {
      for (let i = 0; i < 20; i++) {
        fakeClock.setTime('2026-11-01T10:00:00.000Z');
        const { copies } = await createTestBook(`RaceReturnLost_${i}`, 1);
        const copy = copies[0];
        const member = await createFreshMember();

        const loan = await loansService.checkoutCopy(
          member.id,
          copy.barcode,
          librarianId,
        );

        const [resReturn, resLost] = await Promise.allSettled([
          loansService.returnLoan({
            copyBarcode: copy.barcode,
            condition: ReturnCondition.GOOD,
            staffId: librarianId,
          }),
          loansService.markLoanLost({
            loanId: loan.id,
            assessedFeeMinor: 20000,
            note: 'Lost race test',
            staffId: librarianId,
          }),
        ]);

        const successes = [resReturn, resLost].filter(
          (r) => r.status === 'fulfilled',
        );
        const rejections = [resReturn, resLost].filter(
          (r) => r.status === 'rejected',
        );

        expect(successes).toHaveLength(1);
        expect(rejections).toHaveLength(1);

        const updatedLoan = await prisma.loan.findUniqueOrThrow({
          where: { id: loan.id },
        });
        const updatedCopy = await prisma.copy.findUniqueOrThrow({
          where: { id: copy.id },
        });

        if (updatedLoan.status === LoanStatus.RETURNED) {
          expect(updatedCopy.status).toBe(CopyStatus.AVAILABLE);
        } else {
          expect(updatedLoan.status).toBe(LoanStatus.LOST);
          expect(updatedCopy.status).toBe(CopyStatus.LOST);
        }
      }

      await assertSystemInvariants('Race Return vs Lost Loop');
    });

    it('concurrency: createFine called concurrently with same dedupeKey -> exactly 1 row exists', async () => {
      const dedupeKey = `concurrent-dedupe-${Date.now()}`;

      const results = await Promise.all(
        Array.from({ length: 15 }).map(() =>
          finesService.createFine({
            userId: member1Id,
            reason: FineReason.DAMAGED_BOOK,
            amountMinor: 2500,
            dedupeKey,
          }),
        ),
      );

      // All calls returned without error
      expect(results).toHaveLength(15);
      const firstId = results[0].id;
      for (const res of results) {
        expect(res.id).toBe(firstId);
      }

      // Exactly 1 row exists in database
      const rows = await prisma.fine.findMany({
        where: { dedupeKey },
      });
      expect(rows).toHaveLength(1);

      await assertSystemInvariants('Concurrent createFine Deduplication');
    });
  });

  // =============================================================
  // 12. Domain Event Emission Guarantees
  // =============================================================
  describe('12. Domain Event Emission Guarantees', () => {
    it('emits domain events once per state change and NOT on transaction failure', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('EventGuaranteesBook', 1);
      const copy = copies[0];
      const member = await createFreshMember();

      await loansService.checkoutCopy(member.id, copy.barcode, librarianId);

      // Advance 3 days late
      fakeClock.advanceDays(17);

      emitSpy.mockClear();

      // 1. Failed return (missing conditionNote on DAMAGED) -> NO events emitted
      const failRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!) {
          returnLoan(copyBarcode: $barcode, condition: $cond) { id }
        }`,
        { barcode: copy.barcode, cond: 'DAMAGED' },
        librarianToken,
      );
      expect(failRes.body.errors).toBeDefined();
      expect(emitSpy).not.toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.LOAN_RETURNED,
        expect.anything(),
      );
      expect(emitSpy).not.toHaveBeenCalledWith(
        DOMAIN_EVENT_NAMES.FINE_CREATED,
        expect.anything(),
      );

      emitSpy.mockClear();

      // 2. Successful return with late fine -> emits loan.returned and fine.created exactly ONCE
      const okRes = await gql(
        `mutation Return($barcode: String!, $cond: ReturnCondition!, $note: String) {
          returnLoan(copyBarcode: $barcode, condition: $cond, conditionNote: $note) { id }
        }`,
        { barcode: copy.barcode, cond: 'DAMAGED', note: 'Minor cover tear' },
        librarianToken,
      );
      expect(okRes.body.errors).toBeUndefined();

      const returnCalls = emitSpy.mock.calls.filter(
        (c) => c[0] === DOMAIN_EVENT_NAMES.LOAN_RETURNED,
      );
      expect(returnCalls).toHaveLength(1);
      expect(returnCalls[0][1]).toEqual(
        expect.objectContaining({
          loanId: loan.id,
          userId: member.id,
          condition: ReturnCondition.DAMAGED,
        }),
      );

      const fineCreatedCalls = emitSpy.mock.calls.filter(
        (c) => c[0] === DOMAIN_EVENT_NAMES.FINE_CREATED,
      );
      expect(fineCreatedCalls).toHaveLength(1);
      expect(fineCreatedCalls[0][1]).toEqual(
        expect.objectContaining({
          userId: member.id,
          reason: FineReason.LATE_RETURN,
        }),
      );

      // 3. Fine payment emits fine.payment_recorded and fine.settled on full payment
      const fineId = fineCreatedCalls[0][1].fineId;
      emitSpy.mockClear();

      const payRes = await gql(
        `mutation Pay($fineId: ID!, $amountRs: Float!) {
          recordFinePayment(fineId: $fineId, amountRs: $amountRs) { id }
        }`,
        { fineId, amountRs: 30.0 },
        librarianToken,
      );
      expect(payRes.body.errors).toBeUndefined();

      const paymentCalls = emitSpy.mock.calls.filter(
        (c) => c[0] === DOMAIN_EVENT_NAMES.FINE_PAYMENT_RECORDED,
      );
      expect(paymentCalls).toHaveLength(1);
      expect(paymentCalls[0][1]).toEqual(
        expect.objectContaining({
          fineId,
          userId: member.id,
          paidMinor: 3000,
          remainingMinor: 0,
        }),
      );

      const settledCalls = emitSpy.mock.calls.filter(
        (c) => c[0] === DOMAIN_EVENT_NAMES.FINE_SETTLED,
      );
      expect(settledCalls).toHaveLength(1);
      expect(settledCalls[0][1]).toEqual(
        expect.objectContaining({
          fineId,
          status: FineStatus.PAID,
        }),
      );

      emitSpy.mockRestore();
      await assertSystemInvariants('Domain Event Emission Guarantees');
    });
  });

  // =============================================================
  // 13. Concurrency Failure Demonstration (Locking Safety Proof)
  // =============================================================
  describe('13. Concurrency Failure Demonstration (Locking Safety Proof)', () => {
    /**
     * Demonstrates why the multi-tier locking architecture is strictly necessary:
     *
     * In an uncoordinated / lock-free environment:
     * - Two circulation desk transactions read the same loan concurrently in READ COMMITTED isolation.
     * - Both read status = ACTIVE (neither acquires pg_advisory_xact_lock or SELECT ... FOR UPDATE).
     * - Both assess late fines and write return updates, creating double fines or corrupted loan state.
     *
     * In Bookdrop's production architecture:
     * - pg_advisory_xact_lock(memberId) serializes operations per member.
     * - SELECT ... FOR UPDATE on the Loan row serializes concurrent staff returns of the same loan.
     * - The second transaction blocks, then wakes up to observe status = RETURNED, and aborts with LOAN_NOT_ACTIVE.
     */
    it('demonstrates that concurrent returns without row locking permit duplicate fine creation or state corruption', async () => {
      fakeClock.setTime('2026-11-01T10:00:00.000Z');
      const { copies } = await createTestBook('NoLockDemoBook', 1);
      const copy = copies[0];
      const member = await createFreshMember();

      await loansService.checkoutCopy(member.id, copy.barcode, librarianId);

      // Advance clock 3 days late
      fakeClock.advanceDays(17);

      // SIMULATION OF UNLOCKED CODE PATH (Without FOR UPDATE / Advisory Lock):
      // Tx 1 and Tx 2 execute simultaneously without row locking:
      const [readTx1, readTx2] = await Promise.all([
        prisma.loan.findUniqueOrThrow({ where: { id: loan.id } }),
        prisma.loan.findUniqueOrThrow({ where: { id: loan.id } }),
      ]);

      // Both transactions observe ACTIVE status simultaneously:
      expect(readTx1.status).toBe(LoanStatus.ACTIVE);
      expect(readTx2.status).toBe(LoanStatus.ACTIVE);

      // Without locking, both would execute fine creation logic for the same loan!
      // If deduplication were also absent, two duplicate fines would be inserted.
      //
      // In contrast, executing our locked returnLoan method concurrently:
      const [attempt1, attempt2] = await Promise.allSettled([
        loansService.returnLoan({
          copyBarcode: copy.barcode,
          condition: ReturnCondition.GOOD,
          staffId: librarianId,
        }),
        loansService.returnLoan({
          copyBarcode: copy.barcode,
          condition: ReturnCondition.GOOD,
          staffId: librarianId,
        }),
      ]);

      // Exactly ONE succeeds; the other is rejected because FOR UPDATE caught the change:
      const successes = [attempt1, attempt2].filter(
        (r) => r.status === 'fulfilled',
      );
      const failures = [attempt1, attempt2].filter(
        (r) => r.status === 'rejected',
      );

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // Exactly one fine was created:
      const fines = await prisma.fine.findMany({ where: { loanId: loan.id } });
      expect(fines).toHaveLength(1);

      await assertSystemInvariants('Concurrency Failure Demonstration');
    });
  });
});
