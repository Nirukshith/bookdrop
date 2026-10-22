import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CopyStatus, HoldStatus, Role } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { CopiesService } from '../src/circulation/copies/copies.service';
import { HoldsService } from '../src/circulation/holds/holds.service';
import {
  ACTIVE_LOAN_COUNT_PORT,
  ActiveLoanCountPort,
  UNPAID_FINES_PORT,
  UnpaidFinesPort,
} from '../src/circulation/holds/ports';
import {
  HoldCancelledEvent,
  HoldCreatedEvent,
  HoldExpiredEvent,
} from '../src/circulation/holds/events';
import { ClockService, FakeClockService } from '../src/common/clock';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

describe('Holds (Circulation Remote Requests E2E - Step 9 Comprehensive Suite)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let copiesService: CopiesService;
  let holdsService: HoldsService;
  let eventEmitter: EventEmitter2;
  let fakeClock: FakeClockService;

  const mockLoanCounts = new Map<number, number>();
  const mockUnpaidFines = new Set<number>();

  const testLoanPort: ActiveLoanCountPort = {
    countActiveLoansForMember: async (userId: number) =>
      mockLoanCounts.get(userId) ?? 0,
  };

  const testFinesPort: UnpaidFinesPort = {
    hasUnpaidFines: async (userId: number) => mockUnpaidFines.has(userId),
  };

  let member1Token: string;
  let member1Id: number;
  let member2Token: string;
  let member2Id: number;
  let librarianToken: string;
  let adminToken: string;

  let singleCopyBookId: number;
  let multiCopyBookId: number;

  const testPrefix = `step9_${Date.now()}`;

  // Reusable invariant checker verifying system consistency across all holds and copies
  async function assertHoldsInvariants(contextDescription?: string) {
    // 1. Total ACTIVE holds in DB must match total physical copies in ON_HOLD status
    const activeHoldsCount = await prisma.hold.count({
      where: { status: HoldStatus.ACTIVE },
    });
    const onHoldCopiesCount = await prisma.copy.count({
      where: { status: CopyStatus.ON_HOLD },
    });

    if (activeHoldsCount !== onHoldCopiesCount) {
      throw new Error(
        `Invariant violation: Active holds (${activeHoldsCount}) != OnHold copies (${onHoldCopiesCount}) [${contextDescription || ''}]`,
      );
    }
    expect(activeHoldsCount).toBe(onHoldCopiesCount);

    // 2. No physical copy may have more than one ACTIVE hold
    const activeHoldsPerCopy = await prisma.$queryRaw<
      { copyId: number; count: bigint }[]
    >`
      SELECT "copyId", COUNT(*) as count
      FROM "Hold"
      WHERE status = 'ACTIVE'
      GROUP BY "copyId"
      HAVING COUNT(*) > 1
    `;
    if (activeHoldsPerCopy.length > 0) {
      throw new Error(
        `Invariant violation: Copy has multiple active holds [${contextDescription || ''}]`,
      );
    }
    expect(activeHoldsPerCopy.length).toBe(0);

    // 3. Every ACTIVE hold must be tied to a copy whose status is strictly ON_HOLD
    const mismatchedActive = await prisma.hold.findMany({
      where: {
        status: HoldStatus.ACTIVE,
        copy: { status: { not: CopyStatus.ON_HOLD } },
      },
    });
    if (mismatchedActive.length > 0) {
      throw new Error(
        `Invariant violation: Found active holds whose copies are not ON_HOLD [${contextDescription || ''}]`,
      );
    }
    expect(mismatchedActive.length).toBe(0);
  }

  beforeAll(async () => {
    fakeClock = new FakeClockService('2026-10-22T10:00:00.000Z');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClockService)
      .useValue(fakeClock)
      .overrideProvider(ACTIVE_LOAN_COUNT_PORT)
      .useValue(testLoanPort)
      .overrideProvider(UNPAID_FINES_PORT)
      .useValue(testFinesPort)
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
    eventEmitter = app.get<EventEmitter2>(EventEmitter2);

    // Create shared Author and Category
    const author = await prisma.author.create({
      data: { name: `Author ${testPrefix}` },
    });
    const category = await prisma.category.create({
      data: { name: `Category ${testPrefix}` },
    });

    // Create Book 1: with 1 physical copy
    const book1 = await prisma.book.create({
      data: {
        title: `Single Copy Book ${testPrefix}`,
        isbn: `978-${Date.now().toString().slice(-9)}1`,
        publishedYear: 2026,
        authors: { connect: [{ id: author.id }] },
        categories: { connect: [{ id: category.id }] },
      },
    });
    singleCopyBookId = book1.id;
    await copiesService.addCopies(singleCopyBookId, 1, 'STACK-A1');

    // Create Book 2: with 3 physical copies
    const book2 = await prisma.book.create({
      data: {
        title: `Multi Copy Book ${testPrefix}`,
        isbn: `978-${Date.now().toString().slice(-9)}2`,
        publishedYear: 2026,
        authors: { connect: [{ id: author.id }] },
        categories: { connect: [{ id: category.id }] },
      },
    });
    multiCopyBookId = book2.id;
    await copiesService.addCopies(multiCopyBookId, 3, 'STACK-A2');

    // Create standard test accounts
    const m1User = await usersService.create({
      name: 'Member One',
      email: `${testPrefix}_member1@example.com`,
      password: 'Password123!',
      role: Role.MEMBER,
    });
    member1Id = m1User.id;

    const m2User = await usersService.create({
      name: 'Member Two',
      email: `${testPrefix}_member2@example.com`,
      password: 'Password123!',
      role: Role.MEMBER,
    });
    member2Id = m2User.id;

    await usersService.create({
      name: 'Librarian Staff',
      email: `${testPrefix}_librarian@example.com`,
      password: 'Password123!',
      role: Role.LIBRARIAN,
    });

    await usersService.create({
      name: 'Admin Staff',
      email: `${testPrefix}_admin@example.com`,
      password: 'Password123!',
      role: Role.ADMIN,
    });

    const m1Login = await authService.login({
      email: `${testPrefix}_member1@example.com`,
      password: 'Password123!',
    });
    member1Token = m1Login.accessToken;

    const m2Login = await authService.login({
      email: `${testPrefix}_member2@example.com`,
      password: 'Password123!',
    });
    member2Token = m2Login.accessToken;

    const libLogin = await authService.login({
      email: `${testPrefix}_librarian@example.com`,
      password: 'Password123!',
    });
    librarianToken = libLogin.accessToken;

    const admLogin = await authService.login({
      email: `${testPrefix}_admin@example.com`,
      password: 'Password123!',
    });
    adminToken = admLogin.accessToken;
  });

  afterAll(async () => {
    // Reverse dependency cleanup for tests created in this suite
    const testUsers = await prisma.user.findMany({
      where: { email: { contains: testPrefix } },
      select: { id: true },
    });
    const testUserIds = testUsers.map((u) => u.id);

    await prisma.hold.deleteMany({
      where: {
        OR: [
          { bookId: { in: [singleCopyBookId, multiCopyBookId] } },
          { userId: { in: testUserIds } },
        ],
      },
    });
    await prisma.copyStatusHistory.deleteMany({
      where: {
        copy: {
          book: {
            title: { contains: testPrefix },
          },
        },
      },
    });
    await prisma.copy.deleteMany({
      where: {
        book: {
          title: { contains: testPrefix },
        },
      },
    });
    await prisma.book.deleteMany({
      where: { title: { contains: testPrefix } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: testPrefix } },
    });
    await prisma.author.deleteMany({
      where: { name: { contains: testPrefix } },
    });
    await prisma.category.deleteMany({
      where: { name: { contains: testPrefix } },
    });

    await app.close();
  });

  const gql = (query: string, variables?: any, token?: string) => {
    const req = request(app.getHttpServer()).post('/graphql');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    return req.send({ query, variables });
  };

  describe('1. Core Lifecycle, Copy Synchronization & Fake Clock Deadlines', () => {
    it('request creates an ACTIVE hold, copy becomes ON_HOLD, availableCopies drops by 1, and deadline is 24h later (fake clock)', async () => {
      // 1. Check initial availableCopies count on the multi-copy book
      const beforeRes = await gql(
        `query GetBook($id: Int!) {
          book(id: $id) {
            id
            availableCopies
          }
        }`,
        { id: multiCopyBookId },
      );
      const initialAvailable = beforeRes.body.data.book.availableCopies;
      expect(initialAvailable).toBe(3);

      const t0 = fakeClock.now();

      // 2. Place hold
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
            bookId
            bookTitle
            status
            source
            createdAt
            expiresAt
          }
        }
      `;
      const res = await gql(
        mutation,
        { bookId: multiCopyBookId },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const hold = res.body.data.requestHold;
      expect(hold.status).toBe('ACTIVE');
      expect(hold.source).toBe('REQUEST');
      expect(hold.bookTitle).toContain('Multi Copy Book');

      // 3. Verify deadline is exactly 24 hours later in UTC
      const createdAtMs = new Date(hold.createdAt).getTime();
      const expiresAtMs = new Date(hold.expiresAt).getTime();
      expect(expiresAtMs - createdAtMs).toBe(24 * 60 * 60 * 1000);
      expect(hold.expiresAt).toBe(
        new Date(t0.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      );

      // 4. Verify physical copy in DB is strictly ON_HOLD
      const dbHold = await prisma.hold.findUnique({
        where: { id: parseInt(hold.id, 10) },
        include: { copy: true },
      });
      expect(dbHold?.copy.status).toBe(CopyStatus.ON_HOLD);

      // 5. Verify book.availableCopies dropped by exactly 1
      const afterRes = await gql(
        `query GetBook($id: Int!) {
          book(id: $id) {
            id
            availableCopies
          }
        }`,
        { id: multiCopyBookId },
      );
      expect(afterRes.body.data.book.availableCopies).toBe(
        initialAvailable - 1,
      );

      await assertHoldsInvariants('after basic requestHold');
    });

    it('requesting the same book twice is rejected with ALREADY_HELD', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      // Member 1 already has an active hold on multiCopyBookId
      const res = await gql(
        mutation,
        { bookId: multiCopyBookId },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('ALREADY_HELD');
    });

    it('rejects requestHold on non-existent book with BOOK_NOT_FOUND', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      const res = await gql(mutation, { bookId: 9999999 }, member1Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('BOOK_NOT_FOUND');
    });

    it('rejects unauthenticated calls with UNAUTHENTICATED', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      const res = await gql(mutation, { bookId: multiCopyBookId });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('2. Eligibility Limits & External Domain Ports (Loans & Fines)', () => {
    it('rejects the 4th active hold with HOLD_LIMIT_REACHED', async () => {
      // Create dedicated member for limit testing
      const limitMember = await usersService.create({
        name: 'Hold Limit Member',
        email: `${testPrefix}_holdlimit@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      const limitToken = (
        await authService.login({
          email: `${testPrefix}_holdlimit@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      // Create 4 distinct books each with 1 copy
      const books: { id: number }[] = [];
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      for (let i = 1; i <= 4; i++) {
        const b = await prisma.book.create({
          data: {
            title: `Hold Limit Book ${i} ${testPrefix}`,
            isbn: `978-${Date.now().toString().slice(-8)}${i}1`,
            publishedYear: 2026,
            authors: { connect: [{ id: author!.id }] },
            categories: { connect: [{ id: category!.id }] },
          },
        });
        await copiesService.addCopies(b.id, 1, `STACK-HL${i}`);
        books.push(b);
      }

      // Seed 3 active holds in DB for this member
      for (let i = 0; i < 3; i++) {
        const copy = await prisma.copy.findFirst({
          where: { bookId: books[i].id },
        });
        await prisma.hold.create({
          data: {
            userId: limitMember.id,
            bookId: books[i].id,
            copyId: copy!.id,
            status: HoldStatus.ACTIVE,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });
        await prisma.copy.update({
          where: { id: copy!.id },
          data: { status: CopyStatus.ON_HOLD },
        });
      }

      // 4th active hold must be rejected with HOLD_LIMIT_REACHED
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;
      const res = await gql(mutation, { bookId: books[3].id }, limitToken);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('HOLD_LIMIT_REACHED');

      await assertHoldsInvariants('after 4th hold rejection');
    });

    it('rejects requestHold with NO_COPY_AVAILABLE when all copies of a book are already held', async () => {
      // Member 2 requests the 1 available copy of singleCopyBookId
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;
      const res1 = await gql(
        mutation,
        { bookId: singleCopyBookId },
        member2Token,
      );
      expect(res1.body.errors).toBeUndefined();

      // Now singleCopyBookId has 0 copies available. A new member requests it:
      await usersService.create({
        name: 'Member Three',
        email: `${testPrefix}_member3@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const m3Token = (
        await authService.login({
          email: `${testPrefix}_member3@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const res2 = await gql(mutation, { bookId: singleCopyBookId }, m3Token);

      expect(res2.body.errors).toBeDefined();
      expect(res2.body.errors[0].extensions?.code).toBe('NO_COPY_AVAILABLE');

      await assertHoldsInvariants('after no copy available');
    });

    it('fake ports return limit-reached and unpaid-fines, and matching errors appear', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();
      const portTestBook = await prisma.book.create({
        data: {
          title: `Ports Test Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}88`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      await copiesService.addCopies(portTestBook.id, 2, 'STACK-PT');

      const portMember = await usersService.create({
        name: 'Ports Member',
        email: `${testPrefix}_ports@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const portToken = (
        await authService.login({
          email: `${testPrefix}_ports@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      // 1. Test LOAN_LIMIT_REACHED via mock port
      mockLoanCounts.set(portMember.id, 3);
      const loanLimitRes = await gql(
        mutation,
        { bookId: portTestBook.id },
        portToken,
      );
      expect(loanLimitRes.body.errors).toBeDefined();
      expect(loanLimitRes.body.errors[0].extensions?.code).toBe(
        'LOAN_LIMIT_REACHED',
      );
      mockLoanCounts.delete(portMember.id);

      // 2. Test UNPAID_FINES via mock port
      mockUnpaidFines.add(portMember.id);
      const unpaidFinesRes = await gql(
        mutation,
        { bookId: portTestBook.id },
        portToken,
      );
      expect(unpaidFinesRes.body.errors).toBeDefined();
      expect(unpaidFinesRes.body.errors[0].extensions?.code).toBe(
        'UNPAID_FINES',
      );
      mockUnpaidFines.delete(portMember.id);
    });
  });

  describe('3. Concurrency & Race Condition Scenarios', () => {
    it('concurrency: one member sends 5 requestHold calls at once for different books, and exactly 3 succeed', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      // Create 5 separate books, each with 1 physical copy
      const books5: { id: number }[] = [];
      for (let i = 1; i <= 5; i++) {
        const b = await prisma.book.create({
          data: {
            title: `Batch5 Book ${i} ${testPrefix}`,
            isbn: `978-${Date.now().toString().slice(-8)}${i}5`,
            publishedYear: 2026,
            authors: { connect: [{ id: author!.id }] },
            categories: { connect: [{ id: category!.id }] },
          },
        });
        await copiesService.addCopies(b.id, 1, `STACK-B5-${i}`);
        books5.push(b);
      }

      // Fresh member with 0 initial holds
      const batchMember = await usersService.create({
        name: 'Concurrent Batch Member',
        email: `${testPrefix}_batchmember@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const batchToken = (
        await authService.login({
          email: `${testPrefix}_batchmember@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
            bookId
            status
          }
        }
      `;

      // Fire 5 requests simultaneously in parallel
      const responses = await Promise.all(
        books5.map((book) => gql(mutation, { bookId: book.id }, batchToken)),
      );

      const successful = responses.filter(
        (r) =>
          r.body.data?.requestHold?.id &&
          r.body.data?.requestHold?.status === 'ACTIVE',
      );
      const limitReached = responses.filter(
        (r) => r.body.errors?.[0]?.extensions?.code === 'HOLD_LIMIT_REACHED',
      );

      // Serialized by advisory transaction lock: exactly 3 succeed, exactly 2 hit the limit
      expect(successful.length).toBe(3);
      expect(limitReached.length).toBe(2);

      // Verify DB holds count for this member is strictly 3
      const memberActiveHolds = await prisma.hold.count({
        where: { userId: batchMember.id, status: HoldStatus.ACTIVE },
      });
      expect(memberActiveHolds).toBe(3);

      await assertHoldsInvariants('after 1 member 5 concurrent requests');
    });

    it('concurrency: 20 different members request a book with 3 copies at once, and exactly 3 succeed, 17 get NO_COPY_AVAILABLE, and holds point to 3 different copies', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      // Create 1 book with exactly 3 copies
      const book20 = await prisma.book.create({
        data: {
          title: `Contended Book 20 ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}20`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      await copiesService.addCopies(book20.id, 3, 'STACK-C20');

      // Create 20 unique member accounts
      const memberTokens: string[] = [];
      for (let i = 1; i <= 20; i++) {
        await usersService.create({
          name: `Contender ${i}`,
          email: `${testPrefix}_contender${i}@example.com`,
          password: 'Password123!',
          role: Role.MEMBER,
        });
        const login = await authService.login({
          email: `${testPrefix}_contender${i}@example.com`,
          password: 'Password123!',
        });
        memberTokens.push(login.accessToken);
      }

      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
            copyId
            status
          }
        }
      `;

      // Dispatch 20 concurrent requests simultaneously
      const responses = await Promise.all(
        memberTokens.map((token) =>
          gql(mutation, { bookId: book20.id }, token),
        ),
      );

      const successful = responses.filter(
        (r) =>
          r.body.data?.requestHold?.id &&
          r.body.data?.requestHold?.status === 'ACTIVE',
      );
      const noCopies = responses.filter(
        (r) => r.body.errors?.[0]?.extensions?.code === 'NO_COPY_AVAILABLE',
      );

      expect(successful.length).toBe(3);
      expect(noCopies.length).toBe(17);

      // Verify the 3 holds point to 3 distinct physical copies
      const holdRecords = await prisma.hold.findMany({
        where: { bookId: book20.id, status: HoldStatus.ACTIVE },
      });
      expect(holdRecords.length).toBe(3);

      const assignedCopyIds = new Set(holdRecords.map((h) => h.copyId));
      expect(assignedCopyIds.size).toBe(3);

      await assertHoldsInvariants('after 20 members compete for 3 copies');
    });

    it('concurrency: two members request the last copy at once, and exactly one wins', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const lastCopyBook = await prisma.book.create({
        data: {
          title: `Last Copy Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}91`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      await copiesService.addCopies(lastCopyBook.id, 1, 'STACK-LAST');

      await usersService.create({
        name: 'Competitor A',
        email: `${testPrefix}_compa@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      await usersService.create({
        name: 'Competitor B',
        email: `${testPrefix}_compb@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      const tokenA = (
        await authService.login({
          email: `${testPrefix}_compa@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const tokenB = (
        await authService.login({
          email: `${testPrefix}_compb@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
            status
          }
        }
      `;

      const [resA, resB] = await Promise.all([
        gql(mutation, { bookId: lastCopyBook.id }, tokenA),
        gql(mutation, { bookId: lastCopyBook.id }, tokenB),
      ]);

      const winners = [resA, resB].filter((r) => r.body.data?.requestHold?.id);
      const losers = [resA, resB].filter(
        (r) => r.body.errors?.[0]?.extensions?.code === 'NO_COPY_AVAILABLE',
      );

      expect(winners.length).toBe(1);
      expect(losers.length).toBe(1);

      await assertHoldsInvariants('after two members compete for last copy');
    });

    it('race: fulfillHold and expireHold at the same moment on one hold, and exactly one wins', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const raceBook = await prisma.book.create({
        data: {
          title: `Fulfill Expire Race ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}77`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      const [copy] = await copiesService.addCopies(raceBook.id, 1, 'STACK-FE');

      const raceMember = await usersService.create({
        name: 'Race Member',
        email: `${testPrefix}_racemember@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      // Align fakeClock and hold deadline to the exact same instant
      const raceTime = fakeClock.now();
      const hold = await prisma.hold.create({
        data: {
          userId: raceMember.id,
          bookId: raceBook.id,
          copyId: copy.id,
          status: HoldStatus.ACTIVE,
          expiresAt: raceTime,
          createdAt: new Date(raceTime.getTime() - 24 * 3600 * 1000),
        },
      });
      await prisma.copy.update({
        where: { id: copy.id },
        data: { status: CopyStatus.ON_HOLD },
      });

      // Trigger fulfillHold and expireHold concurrently
      const results = await Promise.allSettled([
        holdsService.fulfillHold(hold.id),
        holdsService.expireHold(hold.id),
      ]);

      const fulfilledSucceeded =
        results[0].status === 'fulfilled' &&
        results[0].value.status === 'FULFILLED';
      const expiredSucceeded =
        results[1].status === 'fulfilled' &&
        results[1].value !== null &&
        results[1].value.status === 'EXPIRED';

      // Exactly ONE won the race via atomic CAS
      expect(Number(fulfilledSucceeded) + Number(expiredSucceeded)).toBe(1);

      const finalHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(['FULFILLED', 'EXPIRED']).toContain(finalHold.status);

      // Clean up the race hold and restore copy to AVAILABLE so global invariants remain clean
      await prisma.hold.deleteMany({ where: { id: hold.id } });
      await prisma.copy.update({
        where: { id: copy.id },
        data: { status: CopyStatus.AVAILABLE },
      });

      await assertHoldsInvariants('after fulfill vs expire race');
    });
  });

  describe('4. Database Engine Partial Unique Indexes Safety Net', () => {
    it('inserting a second ACTIVE hold for the same copy directly with raw SQL fails with unique constraint error', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const rawSqlBook = await prisma.book.create({
        data: {
          title: `Raw SQL Test Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}99`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      const [copy] = await copiesService.addCopies(
        rawSqlBook.id,
        1,
        'STACK-RAW',
      );

      const now = fakeClock.now();
      const deadline = new Date(now.getTime() + 24 * 3600 * 1000);

      // 1. Insert 1st active hold directly via raw SQL
      await prisma.$executeRaw`
        INSERT INTO "Hold" ("userId", "bookId", "copyId", "status", "source", "expiresAt", "createdAt")
        VALUES (${member1Id}, ${rawSqlBook.id}, ${copy.id}, 'ACTIVE', 'REQUEST', ${deadline}, ${now})
      `;

      // 2. Insert 2nd active hold for the SAME copy directly via raw SQL -> must violate hold_one_active_per_copy
      await expect(
        prisma.$executeRaw`
          INSERT INTO "Hold" ("userId", "bookId", "copyId", "status", "source", "expiresAt", "createdAt")
          VALUES (${member2Id}, ${rawSqlBook.id}, ${copy.id}, 'ACTIVE', 'REQUEST', ${deadline}, ${now})
        `,
      ).rejects.toThrow();

      // Clean up raw SQL hold immediately
      await prisma.hold.deleteMany({ where: { bookId: rawSqlBook.id } });
    });

    it('inserting a second ACTIVE hold for the same member and book directly with raw SQL fails with unique constraint error', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const rawSqlBook2 = await prisma.book.create({
        data: {
          title: `Raw SQL Test Book 2 ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}98`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      const [, copy2] = await copiesService.addCopies(
        rawSqlBook2.id,
        2,
        'STACK-RAW2',
      );

      const now = fakeClock.now();
      const deadline = new Date(now.getTime() + 24 * 3600 * 1000);

      // Clean up any existing holds for rawSqlBook2 to isolate test
      await prisma.hold.deleteMany({ where: { bookId: rawSqlBook2.id } });

      // 1. Insert 1st active hold for member1 on rawSqlBook2
      await prisma.$executeRaw`
        INSERT INTO "Hold" ("userId", "bookId", "copyId", "status", "source", "expiresAt", "createdAt")
        VALUES (${member1Id}, ${rawSqlBook2.id}, ${copy2.id}, 'ACTIVE', 'REQUEST', ${deadline}, ${now})
      `;

      // 2. Insert 2nd active hold for SAME member1 on rawSqlBook2 with different copy -> must violate hold_one_active_per_user_book
      await expect(
        prisma.$executeRaw`
          INSERT INTO "Hold" ("userId", "bookId", "copyId", "status", "source", "expiresAt", "createdAt")
          VALUES (${member1Id}, ${rawSqlBook2.id}, ${copy2.id}, 'ACTIVE', 'REQUEST', ${deadline}, ${now})
        `,
      ).rejects.toThrow();

      // Clean up raw sql holds
      await prisma.hold.deleteMany({ where: { bookId: rawSqlBook2.id } });
    });
  });

  describe('5. Cancellations & Role Authorization', () => {
    let cancelTargetHoldId: number;
    let cancelTargetCopyId: number;

    beforeAll(async () => {
      // Find an active hold for member 1 created earlier
      const activeHold = await prisma.hold.findFirst({
        where: { userId: member1Id, status: HoldStatus.ACTIVE },
      });
      cancelTargetHoldId = activeHold!.id;
      cancelTargetCopyId = activeHold!.copyId;
    });

    it('cancel by another member is forbidden (403)', async () => {
      const mutation = `
        mutation CancelMyHold($holdId: Int!) {
          cancelMyHold(holdId: $holdId) {
            id
          }
        }
      `;
      // Member 2 tries to cancel member 1's hold
      const res = await gql(
        mutation,
        { holdId: cancelTargetHoldId },
        member2Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });

    it('cancel by the owner frees the physical copy to AVAILABLE', async () => {
      const mutation = `
        mutation CancelMyHold($holdId: Int!) {
          cancelMyHold(holdId: $holdId) {
            id
            status
            resolvedAt
            resolvedNote
          }
        }
      `;
      const res = await gql(
        mutation,
        { holdId: cancelTargetHoldId },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.cancelMyHold.status).toBe('CANCELLED');

      // Verify physical copy returned to AVAILABLE
      const copy = await prisma.copy.findUnique({
        where: { id: cancelTargetCopyId },
      });
      expect(copy?.status).toBe(CopyStatus.AVAILABLE);

      await assertHoldsInvariants('after cancel by owner');
    });

    it('cancelling twice gives HOLD_NOT_ACTIVE error', async () => {
      const mutation = `
        mutation CancelMyHold($holdId: Int!) {
          cancelMyHold(holdId: $holdId) {
            id
          }
        }
      `;
      const res = await gql(
        mutation,
        { holdId: cancelTargetHoldId },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('HOLD_NOT_ACTIVE');
    });

    it('staff cancel works on any member hold and frees copy', async () => {
      // Member 2 has an active hold on singleCopyBookId
      const m2Hold = await prisma.hold.findFirst({
        where: { userId: member2Id, status: HoldStatus.ACTIVE },
      });
      expect(m2Hold).not.toBeNull();

      const mutation = `
        mutation StaffCancelHold($holdId: Int!, $reason: String) {
          cancelHold(holdId: $holdId, reason: $reason) {
            id
            status
            resolvedNote
          }
        }
      `;
      const res = await gql(
        mutation,
        { holdId: m2Hold!.id, reason: 'Desk cleanup by librarian' },
        librarianToken,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.cancelHold.status).toBe('CANCELLED');
      expect(res.body.data.cancelHold.resolvedNote).toBe(
        'Desk cleanup by librarian',
      );

      // Physical copy released back to AVAILABLE
      const copy = await prisma.copy.findUnique({
        where: { id: m2Hold!.copyId },
      });
      expect(copy?.status).toBe(CopyStatus.AVAILABLE);

      await assertHoldsInvariants('after staff cancel');
    });

    it('forbids member from calling staff cancelHold mutation', async () => {
      const mutation = `
        mutation StaffCancelHold($holdId: Int!, $reason: String) {
          cancelHold(holdId: $holdId, reason: $reason) {
            id
          }
        }
      `;
      const res = await gql(
        mutation,
        { holdId: 1, reason: 'Hacking attempt' },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });
  });

  describe('6. Automated Expiration with Fake Clock & Batch Idempotency', () => {
    it('move fake clock past deadline: expireDueHolds expires hold, frees copy, and emits hold.expired; running twice does not double process', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const expireBook = await prisma.book.create({
        data: {
          title: `Expire Test Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}33`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      const [copy] = await copiesService.addCopies(
        expireBook.id,
        1,
        'STACK-EXP',
      );

      const expMember = await usersService.create({
        name: 'Expire Member',
        email: `${testPrefix}_expmember@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      // Hold created at current fakeClock time (expiresAt = now + 24h)
      const t0 = fakeClock.now();
      const hold = await prisma.hold.create({
        data: {
          userId: expMember.id,
          bookId: expireBook.id,
          copyId: copy.id,
          status: HoldStatus.ACTIVE,
          expiresAt: new Date(t0.getTime() + 24 * 3600 * 1000),
          createdAt: t0,
        },
      });
      await prisma.copy.update({
        where: { id: copy.id },
        data: { status: CopyStatus.ON_HOLD },
      });

      // Spy on EventEmitter to verify hold.expired emission
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      // Advance clock by 25 hours (past the 24-hour deadline)
      fakeClock.advanceHours(25);

      // Run expireDueHolds
      const result1 = await holdsService.expireDueHolds();
      expect(result1.processed).toBeGreaterThanOrEqual(1);
      expect(result1.errors).toBe(0);

      // Verify hold in DB is EXPIRED
      const expiredHold = await prisma.hold.findUniqueOrThrow({
        where: { id: hold.id },
      });
      expect(expiredHold.status).toBe(HoldStatus.EXPIRED);
      expect(expiredHold.resolvedNote).toContain('deadline');

      // Verify physical copy returned to AVAILABLE
      const copyAfter = await prisma.copy.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(copyAfter.status).toBe(CopyStatus.AVAILABLE);

      // Verify event hold.expired was emitted
      expect(emitSpy).toHaveBeenCalledWith(
        HoldExpiredEvent.EVENT_NAME,
        expect.objectContaining({
          holdId: hold.id,
          copyId: copy.id,
        }),
      );

      // Running it twice does NOT double-process
      const result2 = await holdsService.expireDueHolds();
      expect(result2.processed).toBe(0);
      expect(result2.errors).toBe(0);

      emitSpy.mockRestore();
      await assertHoldsInvariants('after expireDueHolds');
    });

    it('two simultaneous runs of expireDueHolds process each due hold once', async () => {
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const dualBook = await prisma.book.create({
        data: {
          title: `Dual Expire Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}34`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      const copies = await copiesService.addCopies(
        dualBook.id,
        2,
        'STACK-DUAL',
      );

      const userA = await usersService.create({
        name: 'Dual Expire A',
        email: `${testPrefix}_dual_a@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const userB = await usersService.create({
        name: 'Dual Expire B',
        email: `${testPrefix}_dual_b@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      const pastDeadline = new Date(fakeClock.now().getTime() - 3600 * 1000);

      // Create 2 overdue active holds
      await prisma.hold.create({
        data: {
          userId: userA.id,
          bookId: dualBook.id,
          copyId: copies[0].id,
          status: HoldStatus.ACTIVE,
          expiresAt: pastDeadline,
        },
      });
      await prisma.copy.update({
        where: { id: copies[0].id },
        data: { status: CopyStatus.ON_HOLD },
      });

      await prisma.hold.create({
        data: {
          userId: userB.id,
          bookId: dualBook.id,
          copyId: copies[1].id,
          status: HoldStatus.ACTIVE,
          expiresAt: pastDeadline,
        },
      });
      await prisma.copy.update({
        where: { id: copies[1].id },
        data: { status: CopyStatus.ON_HOLD },
      });

      // Run two instances concurrently using FOR UPDATE SKIP LOCKED
      const [res1, res2] = await Promise.all([
        holdsService.expireDueHolds(10),
        holdsService.expireDueHolds(10),
      ]);

      expect(res1.errors).toBe(0);
      expect(res2.errors).toBe(0);
      // Both together processed exactly 2 holds without collision
      expect(res1.processed + res2.processed).toBe(2);

      await assertHoldsInvariants('after concurrent expireDueHolds');
    });
  });

  describe('7. Member and Staff Access Control & DataLoader', () => {
    it('member cannot read another member hold; copyBarcode is hidden from members', async () => {
      // Create a fresh hold for Member 2
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();
      const secBook = await prisma.book.create({
        data: {
          title: `Security Test Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}71`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      const [secCopy] = await copiesService.addCopies(
        secBook.id,
        1,
        'STACK-SEC',
      );

      const secHold = await prisma.hold.create({
        data: {
          userId: member2Id,
          bookId: secBook.id,
          copyId: secCopy.id,
          status: HoldStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });
      await prisma.copy.update({
        where: { id: secCopy.id },
        data: { status: CopyStatus.ON_HOLD },
      });

      // 1. Member 1 queries myHolds -> should NOT contain secHold
      const myHoldsRes = await gql(
        `query MyHolds {
          myHolds {
            id
            copyBarcode
            bookTitle
          }
        }`,
        undefined,
        member1Token,
      );
      expect(myHoldsRes.status).toBe(200);
      const m1Holds = myHoldsRes.body.data.myHolds;
      expect(m1Holds.some((h: any) => h.id === String(secHold.id))).toBe(false);

      // copyBarcode is null for members
      for (const h of m1Holds) {
        expect(h.copyBarcode).toBeNull();
        expect(typeof h.bookTitle).toBe('string');
      }

      // 2. Member 1 tries to query hold(id) -> forbidden
      const singleHoldRes = await gql(
        `query GetHold($id: Int!) {
          hold(id: $id) {
            id
            copyBarcode
          }
        }`,
        { id: secHold.id },
        member1Token,
      );
      expect(singleHoldRes.status).toBe(200);
      expect(singleHoldRes.body.errors).toBeDefined();
      expect(singleHoldRes.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });

    it('MEMBER cannot call staff holds query; staff query reveals copyBarcode', async () => {
      // 1. Member queries staff holds -> FORBIDDEN
      const memberQuery = await gql(
        `query StaffHolds { holds { id } }`,
        undefined,
        member1Token,
      );
      expect(memberQuery.body.errors).toBeDefined();
      expect(memberQuery.body.errors[0].extensions?.code).toBe('FORBIDDEN');

      // 2. Staff (Librarian) queries holds -> permitted, includes copyBarcode for pickup desk
      const staffQuery = await gql(
        `query StaffHolds {
          holds(pagination: { take: 5 }) {
            id
            bookTitle
            copyBarcode
            status
          }
        }`,
        undefined,
        librarianToken,
      );
      expect(staffQuery.status).toBe(200);
      expect(staffQuery.body.errors).toBeUndefined();
      const items = staffQuery.body.data.holds;
      expect(items.length).toBeGreaterThan(0);

      const itemsWithBarcode = items.filter((h: any) => h.copyBarcode !== null);
      expect(itemsWithBarcode.length).toBeGreaterThan(0);
      expect(itemsWithBarcode[0].copyBarcode).toMatch(/^BD-/);
    });

    it('ADMIN role can query holds with pagination and filter', async () => {
      const adminQuery = await gql(
        `query AdminHolds {
          holds(pagination: { take: 3 }, filter: { status: ACTIVE }) {
            id
            bookTitle
            copyBarcode
            status
          }
        }`,
        undefined,
        adminToken,
      );
      expect(adminQuery.status).toBe(200);
      expect(adminQuery.body.errors).toBeUndefined();
      expect(adminQuery.body.data.holds).toBeDefined();
    });

    it('unauthenticated calls to queries and mutations are rejected', async () => {
      const q1 = await gql(`query { myHolds { id } }`);
      expect(q1.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

      const q2 = await gql(`query { holds { id } }`);
      expect(q2.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

      const q3 = await gql(`query { hold(id: 1) { id } }`);
      expect(q3.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

      const m1 = await gql(`mutation { cancelMyHold(holdId: 1) { id } }`);
      expect(m1.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('8. Domain Event Emission Guarantees', () => {
    it('events are emitted once per state change and NOT when the transaction fails', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();
      const eventBook = await prisma.book.create({
        data: {
          title: `Event Guarantee Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}66`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });
      await copiesService.addCopies(eventBook.id, 1, 'STACK-EVT');

      await usersService.create({
        name: 'Event Member',
        email: `${testPrefix}_evmember@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const evToken = (
        await authService.login({
          email: `${testPrefix}_evmember@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      emitSpy.mockClear();

      // 1. Successful hold request -> emits hold.created once
      const successRes = await gql(mutation, { bookId: eventBook.id }, evToken);
      expect(successRes.body.errors).toBeUndefined();
      const holdId = parseInt(successRes.body.data.requestHold.id, 10);

      const holdCreatedCalls = emitSpy.mock.calls.filter(
        (c) => c[0] === HoldCreatedEvent.EVENT_NAME,
      );
      expect(holdCreatedCalls.length).toBe(1);
      expect(holdCreatedCalls[0][1]).toEqual(
        expect.objectContaining({ holdId }),
      );

      emitSpy.mockClear();

      // 2. Failed hold request (duplicate ALREADY_HELD) -> does NOT emit hold.created
      const failRes = await gql(mutation, { bookId: eventBook.id }, evToken);
      expect(failRes.body.errors).toBeDefined();
      expect(emitSpy).not.toHaveBeenCalledWith(
        HoldCreatedEvent.EVENT_NAME,
        expect.anything(),
      );

      emitSpy.mockClear();

      // 3. Successful cancel -> emits hold.cancelled once
      const cancelMutation = `
        mutation CancelMyHold($holdId: Int!) {
          cancelMyHold(holdId: $holdId) {
            id
            status
          }
        }
      `;
      const cancelRes = await gql(cancelMutation, { holdId }, evToken);
      expect(cancelRes.body.errors).toBeUndefined();

      const holdCancelledCalls = emitSpy.mock.calls.filter(
        (c) => c[0] === HoldCancelledEvent.EVENT_NAME,
      );
      expect(holdCancelledCalls.length).toBe(1);
      expect(holdCancelledCalls[0][1]).toEqual(
        expect.objectContaining({
          holdId,
          cancelledBy: 'member',
        }),
      );

      emitSpy.mockClear();

      // 4. Failed cancel (HOLD_NOT_ACTIVE) -> does NOT emit hold.cancelled
      const cancelFailRes = await gql(cancelMutation, { holdId }, evToken);
      expect(cancelFailRes.body.errors).toBeDefined();
      expect(emitSpy).not.toHaveBeenCalledWith(
        HoldCancelledEvent.EVENT_NAME,
        expect.anything(),
      );

      emitSpy.mockRestore();
      await assertHoldsInvariants('after event emission guarantees');
    });
  });
});
