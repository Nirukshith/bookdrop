import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CopyStatus, HoldStatus, Role } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { CopiesService } from '../src/circulation/copies/copies.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

describe('Holds (Circulation Remote Requests E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let copiesService: CopiesService;

  let member1Token: string;
  let member1Id: number;
  let member2Token: string;
  let member2Id: number;
  let librarianToken: string;
  let adminToken: string;

  let singleCopyBookId: number;
  let multiCopyBookId: number;
  let limitTestBookIds: number[] = [];

  const testPrefix = `holdstest_${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    // Create shared Author and Category
    const author = await prisma.author.create({
      data: { name: `Author ${testPrefix}` },
    });
    const category = await prisma.category.create({
      data: { name: `Category ${testPrefix}` },
    });

    // Create Book 1: with 1 physical copy (for single allocation & concurrency tests)
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

    // Create Book 2: with 3 physical copies (for standard tests)
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

    // Create 3 books for hold limit testing
    limitTestBookIds = [];
    for (let i = 1; i <= 4; i++) {
      const b = await prisma.book.create({
        data: {
          title: `Limit Book ${i} ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-8)}${i}0`,
          publishedYear: 2026,
          authors: { connect: [{ id: author.id }] },
          categories: { connect: [{ id: category.id }] },
        },
      });
      limitTestBookIds.push(b.id);
      await copiesService.addCopies(b.id, 1, `STACK-L${i}`);
    }

    // Create test accounts
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
    // Reverse dependency cleanup
    const allBookIds = [singleCopyBookId, multiCopyBookId, ...limitTestBookIds];

    await prisma.hold.deleteMany({
      where: { bookId: { in: allBookIds } },
    });
    await prisma.copyStatusHistory.deleteMany({
      where: { copy: { bookId: { in: allBookIds } } },
    });
    await prisma.copy.deleteMany({
      where: { bookId: { in: allBookIds } },
    });
    await prisma.book.deleteMany({
      where: { id: { in: allBookIds } },
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

  describe('1. Member Hold Placement (requestHold)', () => {
    it('successfully places a hold on an available copy and sets copy to ON_HOLD', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
            bookId
            bookTitle
            status
            source
            expiresAt
            createdAt
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
      expect(hold.id).toBeDefined();
      expect(hold.bookId).toBe(multiCopyBookId);
      expect(hold.bookTitle).toContain('Multi Copy Book');
      expect(hold.status).toBe('ACTIVE');
      expect(hold.source).toBe('REQUEST');

      // Pickup deadline is in future (~7 days)
      const expiresAt = new Date(hold.expiresAt);
      const createdAt = new Date(hold.createdAt);
      expect(expiresAt.getTime()).toBeGreaterThan(createdAt.getTime());

      // Verify that the allocated physical copy status in DB is ON_HOLD
      const holdInDb = await prisma.hold.findUnique({
        where: { id: parseInt(hold.id, 10) },
        include: { copy: true },
      });
      expect(holdInDb).not.toBeNull();
      expect(holdInDb?.copy.status).toBe(CopyStatus.ON_HOLD);
    });

    it('rejects duplicate hold request on same book with ALREADY_HELD error', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      const res = await gql(
        mutation,
        { bookId: multiCopyBookId },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('ALREADY_HELD');
    });

    it('rejects hold request on non-existent book with BOOK_NOT_FOUND', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      const res = await gql(mutation, { bookId: 999999 }, member1Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('BOOK_NOT_FOUND');
    });

    it('rejects unauthenticated requestHold with UNAUTHENTICATED', async () => {
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

  describe('2. Hold Limits & Copy Availability', () => {
    it('enforces maximum 3 active holds limit (HOLD_LIMIT_REACHED)', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      // Create dedicated member for limit test
      const limitMember = await usersService.create({
        name: 'Limit Member',
        email: `${testPrefix}_limitmember@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      const limitToken = (
        await authService.login({
          email: `${testPrefix}_limitmember@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      // Seed 3 active holds directly in DB for this member
      for (let i = 0; i < 3; i++) {
        const copy = await prisma.copy.findFirst({
          where: { bookId: limitTestBookIds[i] },
        });
        await prisma.hold.create({
          data: {
            userId: limitMember.id,
            bookId: limitTestBookIds[i],
            copyId: copy!.id,
            status: HoldStatus.ACTIVE,
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          },
        });
      }

      // Attempt 4th hold on limitTestBookIds[3] -> rejected with HOLD_LIMIT_REACHED
      const res = await gql(
        mutation,
        { bookId: limitTestBookIds[3] },
        limitToken,
      );
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('HOLD_LIMIT_REACHED');

      await prisma.hold.deleteMany({ where: { userId: limitMember.id } });
      await prisma.user.delete({ where: { id: limitMember.id } });
    });

    it('rejects requestHold with NO_COPY_AVAILABLE when all copies are already held', async () => {
      const mutation = `
        mutation RequestHold($bookId: Int!) {
          requestHold(bookId: $bookId) {
            id
          }
        }
      `;

      // Member 2 requests the single available copy of singleCopyBookId
      const res1 = await gql(
        mutation,
        { bookId: singleCopyBookId },
        member2Token,
      );
      expect(res1.body.errors).toBeUndefined();
      expect(res1.body.data.requestHold.id).toBeDefined();

      // Now singleCopyBookId has 0 available copies.
      // Another user (or member 1 if eligible) attempts to hold it -> NO_COPY_AVAILABLE
      // We create member 3 for this test
      const m3 = await usersService.create({
        name: 'Member Three',
        email: `${testPrefix}_member3@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const m3Login = await authService.login({
        email: `${testPrefix}_member3@example.com`,
        password: 'Password123!',
      });

      const res2 = await gql(
        mutation,
        { bookId: singleCopyBookId },
        m3Login.accessToken,
      );
      expect(res2.body.errors).toBeDefined();
      expect(res2.body.errors[0].extensions?.code).toBe('NO_COPY_AVAILABLE');

      await prisma.user.delete({ where: { id: m3.id } });
    });
  });

  describe('3. Member Queries & Field-Level Authorization (myHolds)', () => {
    it('returns member holds with bookTitle and hides copyBarcode from members', async () => {
      const query = `
        query MyHolds {
          myHolds(status: ACTIVE) {
            id
            bookId
            bookTitle
            copyBarcode
            status
            expiresAt
          }
        }
      `;

      const res = await gql(query, undefined, member1Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const holds = res.body.data.myHolds;
      expect(holds.length).toBeGreaterThan(0);

      for (const hold of holds) {
        expect(hold.bookTitle).toBeDefined();
        expect(typeof hold.bookTitle).toBe('string');
        // Critical: copyBarcode MUST be null for members
        expect(hold.copyBarcode).toBeNull();
      }
    });

    it('only returns the calling member own holds, never other members holds', async () => {
      const query = `
        query MyHolds {
          myHolds {
            id
            userId
          }
        }
      `;

      const res = await gql(query, undefined, member2Token);
      expect(res.body.errors).toBeUndefined();

      const holds = res.body.data.myHolds;
      for (const hold of holds) {
        expect(hold.userId).toBe(member2Id);
      }
    });
  });

  describe('4. Hold Cancellation (cancelMyHold & cancelHold)', () => {
    let holdToCancelId: number;

    beforeAll(async () => {
      // Find an active hold for member 1
      const activeHold = await prisma.hold.findFirst({
        where: { userId: member1Id, status: HoldStatus.ACTIVE },
      });
      holdToCancelId = activeHold!.id;
    });

    it('forbids member from cancelling another member hold', async () => {
      const mutation = `
        mutation CancelMyHold($holdId: Int!) {
          cancelMyHold(holdId: $holdId) {
            id
          }
        }
      `;

      // Member 2 tries to cancel member 1's hold
      const res = await gql(mutation, { holdId: holdToCancelId }, member2Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });

    it('allows member to cancel their own hold, releasing copy to AVAILABLE', async () => {
      const holdBefore = await prisma.hold.findUnique({
        where: { id: holdToCancelId },
      });

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

      const res = await gql(mutation, { holdId: holdToCancelId }, member1Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const cancelled = res.body.data.cancelMyHold;
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.resolvedAt).toBeDefined();

      // Check physical copy returned to AVAILABLE
      const copyAfter = await prisma.copy.findUnique({
        where: { id: holdBefore!.copyId },
      });
      expect(copyAfter?.status).toBe(CopyStatus.AVAILABLE);
    });

    it('rejects cancelling an already cancelled hold with HOLD_NOT_ACTIVE', async () => {
      const mutation = `
        mutation CancelMyHold($holdId: Int!) {
          cancelMyHold(holdId: $holdId) {
            id
          }
        }
      `;

      const res = await gql(mutation, { holdId: holdToCancelId }, member1Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('HOLD_NOT_ACTIVE');
    });

    it('allows staff (LIBRARIAN) to cancel any member hold with a reason', async () => {
      // Find active hold of Member 2
      const m2Hold = await prisma.hold.findFirst({
        where: { userId: member2Id, status: HoldStatus.ACTIVE },
      });
      expect(m2Hold).not.toBeNull();

      const staffMutation = `
        mutation StaffCancelHold($holdId: Int!, $reason: String) {
          cancelHold(holdId: $holdId, reason: $reason) {
            id
            status
            resolvedNote
          }
        }
      `;

      const res = await gql(
        staffMutation,
        { holdId: m2Hold!.id, reason: 'Desk reservation cleanup' },
        librarianToken,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const cancelled = res.body.data.cancelHold;
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.resolvedNote).toBe('Desk reservation cleanup');

      // Verify physical copy released
      const copy = await prisma.copy.findUnique({
        where: { id: m2Hold!.copyId },
      });
      expect(copy?.status).toBe(CopyStatus.AVAILABLE);
    });

    it('forbids non-staff (MEMBER) from executing staff cancelHold mutation', async () => {
      const staffMutation = `
        mutation StaffCancelHold($holdId: Int!, $reason: String) {
          cancelHold(holdId: $holdId, reason: $reason) {
            id
          }
        }
      `;

      const res = await gql(
        staffMutation,
        { holdId: 1, reason: 'Unauthorized' },
        member1Token,
      );

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });
  });

  describe('5. Staff Holds Query & Barcode Visibility', () => {
    it('allows staff to query holds and inspect copyBarcode', async () => {
      const query = `
        query StaffHolds {
          holds(pagination: { take: 10 }) {
            id
            bookTitle
            copyBarcode
            status
          }
        }
      `;

      const res = await gql(query, undefined, librarianToken);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const items = res.body.data.holds;
      expect(items.length).toBeGreaterThan(0);

      // Staff CAN see copyBarcode for the pickup desk
      const withBarcode = items.filter((h: any) => h.copyBarcode !== null);
      expect(withBarcode.length).toBeGreaterThan(0);
      expect(withBarcode[0].copyBarcode).toMatch(/^BD-/);
    });

    it('allows ADMIN role to query holds with pagination', async () => {
      const query = `
        query AdminHolds {
          holds(pagination: { take: 5 }) {
            id
            bookTitle
          }
        }
      `;

      const res = await gql(query, undefined, adminToken);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.holds).toBeDefined();
    });

    it('forbids MEMBER from accessing staff holds query', async () => {
      const query = `
        query StaffHolds {
          holds {
            id
          }
        }
      `;

      const res = await gql(query, undefined, member1Token);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions?.code).toBe('FORBIDDEN');
    });

    it('allows staff to query single hold by id', async () => {
      const anyHold = await prisma.hold.findFirst();
      expect(anyHold).not.toBeNull();

      const query = `
        query GetHold($id: Int!) {
          hold(id: $id) {
            id
            bookId
            bookTitle
            copyBarcode
            status
          }
        }
      `;

      const res = await gql(query, { id: anyHold!.id }, librarianToken);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.hold.id).toBe(String(anyHold!.id));
      expect(res.body.data.hold.copyBarcode).toBeDefined();
    });
  });

  describe('6. Concurrency Safety: Competing Hold Requests', () => {
    it('allocates copy to exactly one member when two members compete for a single copy', async () => {
      // Create a fresh book with exactly 1 copy
      const author = await prisma.author.findFirst();
      const category = await prisma.category.findFirst();

      const raceBook = await prisma.book.create({
        data: {
          title: `Race Book ${testPrefix}`,
          isbn: `978-${Date.now().toString().slice(-9)}9`,
          publishedYear: 2026,
          authors: { connect: [{ id: author!.id }] },
          categories: { connect: [{ id: category!.id }] },
        },
      });

      await copiesService.addCopies(raceBook.id, 1, 'RACE-01');

      // Create two fresh competitors
      const comp1 = await usersService.create({
        name: 'Competitor One',
        email: `${testPrefix}_comp1@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });
      const comp2 = await usersService.create({
        name: 'Competitor Two',
        email: `${testPrefix}_comp2@example.com`,
        password: 'Password123!',
        role: Role.MEMBER,
      });

      const token1 = (
        await authService.login({
          email: `${testPrefix}_comp1@example.com`,
          password: 'Password123!',
        })
      ).accessToken;

      const token2 = (
        await authService.login({
          email: `${testPrefix}_comp2@example.com`,
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

      // Fire both requests simultaneously
      const [res1, res2] = await Promise.all([
        gql(mutation, { bookId: raceBook.id }, token1),
        gql(mutation, { bookId: raceBook.id }, token2),
      ]);

      const successResults = [res1, res2].filter(
        (r) => r.body.data?.requestHold?.id,
      );
      const failedResults = [res1, res2].filter(
        (r) => r.body.errors && r.body.errors.length > 0,
      );

      // Exactly ONE succeeds and ONE fails with NO_COPY_AVAILABLE
      expect(successResults.length).toBe(1);
      expect(failedResults.length).toBe(1);
      expect(failedResults[0].body.errors[0].extensions?.code).toBe(
        'NO_COPY_AVAILABLE',
      );

      // Verify that DB has exactly 1 active hold for this book
      const dbHolds = await prisma.hold.findMany({
        where: { bookId: raceBook.id, status: HoldStatus.ACTIVE },
      });
      expect(dbHolds.length).toBe(1);

      // Cleanup race test records
      await prisma.hold.deleteMany({ where: { bookId: raceBook.id } });
      await prisma.copyStatusHistory.deleteMany({
        where: { copy: { bookId: raceBook.id } },
      });
      await prisma.copy.deleteMany({ where: { bookId: raceBook.id } });
      await prisma.book.delete({ where: { id: raceBook.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [comp1.id, comp2.id] } },
      });
    });
  });
});
