import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CopyStatus, Role } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { CopiesService } from '../src/circulation/copies/copies.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

describe('Copies (Physical Inventory E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;
  let copiesService: CopiesService;

  let memberToken: string;
  let librarianToken: string;
  let adminToken: string;
  let librarianUserId: number;

  let testBookId: number;

  const testPrefix = `copiestest_${Date.now()}`;

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

    // Create a dedicated test book
    const author = await prisma.author.create({
      data: { name: `Author ${testPrefix}` },
    });
    const category = await prisma.category.create({
      data: { name: `Cat ${testPrefix}` },
    });

    const book = await prisma.book.create({
      data: {
        title: `Test Book ${testPrefix}`,
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

    await usersService.create({
      name: 'E2E Member',
      email: memberEmail,
      password: 'Password123!',
      role: Role.MEMBER,
    });

    const librarianUser = await usersService.create({
      name: 'E2E Librarian',
      email: librarianEmail,
      password: 'Password123!',
      role: Role.LIBRARIAN,
    });
    librarianUserId = librarianUser.id;

    await usersService.create({
      name: 'E2E Admin',
      email: adminEmail,
      password: 'Password123!',
      role: Role.ADMIN,
    });

    const memberLogin = await authService.login({
      email: memberEmail,
      password: 'Password123!',
    });
    memberToken = memberLogin.accessToken;

    const librarianLogin = await authService.login({
      email: librarianEmail,
      password: 'Password123!',
    });
    librarianToken = librarianLogin.accessToken;

    const adminLogin = await authService.login({
      email: adminEmail,
      password: 'Password123!',
    });
    adminToken = adminLogin.accessToken;
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order
    await prisma.copyStatusHistory.deleteMany({
      where: { copy: { bookId: testBookId } },
    });
    await prisma.copy.deleteMany({
      where: { bookId: testBookId },
    });
    await prisma.book.deleteMany({
      where: { id: testBookId },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { contains: testPrefix } } },
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

  describe('1. Librarian adds copies and availability synchronization', () => {
    it('allows a librarian to add copies and reflects in Book.availableCopies and copies query', async () => {
      // Initially, availableCopies is 0
      const initialBookRes = await gql(
        `query GetBook($id: Int!) {
          book(id: $id) {
            id
            availableCopies
          }
        }`,
        { id: testBookId },
      );
      expect(initialBookRes.body.data.book.availableCopies).toBe(0);

      // Librarian adds 3 copies in batch
      const addCopiesMutation = `
        mutation AddCopies($bookId: Int!, $quantity: Int!, $shelfLocation: String) {
          addCopies(bookId: $bookId, quantity: $quantity, shelfLocation: $shelfLocation) {
            id
            bookId
            barcode
            status
            shelfLocation
          }
        }
      `;
      const addRes = await gql(
        addCopiesMutation,
        { bookId: testBookId, quantity: 3, shelfLocation: 'AISLE-4B' },
        librarianToken,
      );

      expect(addRes.status).toBe(200);
      expect(addRes.body.errors).toBeUndefined();
      const createdCopies = addRes.body.data.addCopies;
      expect(createdCopies).toHaveLength(3);
      expect(createdCopies[0].shelfLocation).toBe('AISLE-4B');
      expect(createdCopies[0].status).toBe('AVAILABLE');
      expect(createdCopies[0].barcode).toMatch(/^BD-\d{6}$/);

      // Book.availableCopies now returns 3
      const updatedBookRes = await gql(
        `query GetBook($id: Int!) {
          book(id: $id) {
            id
            availableCopies
          }
        }`,
        { id: testBookId },
      );
      expect(updatedBookRes.body.data.book.availableCopies).toBe(3);

      // Librarian can list the copies
      const listRes = await gql(
        `query GetCopies($bookId: Int) {
          copies(bookId: $bookId) {
            id
            barcode
            status
          }
        }`,
        { bookId: testBookId },
        librarianToken,
      );
      expect(listRes.body.data.copies).toHaveLength(3);
    });
  });

  describe('2. Role-Based Access Control (RBAC) Enforcement', () => {
    it('forbids MEMBER from invoking copy mutations', async () => {
      const res = await gql(
        `mutation {
          addCopies(bookId: ${testBookId}, quantity: 1) { id }
        }`,
        {},
        memberToken,
      );
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(/Access denied|Forbidden/i);
    });

    it('forbids MEMBER from invoking copy queries', async () => {
      const res = await gql(
        `query {
          copies(bookId: ${testBookId}) { id }
        }`,
        {},
        memberToken,
      );
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(/Access denied|Forbidden/i);
    });

    it('forbids MEMBER from querying staff-only Book.copyCounts', async () => {
      const res = await gql(
        `query GetBookCounts($id: Int!) {
          book(id: $id) {
            id
            copyCounts {
              total
              available
            }
          }
        }`,
        { id: testBookId },
        memberToken,
      );
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(/Access denied|Forbidden/i);
    });

    it('allows ADMIN to query staff-only Book.copyCounts', async () => {
      const res = await gql(
        `query GetBookCounts($id: Int!) {
          book(id: $id) {
            id
            copyCounts {
              total
              available
            }
          }
        }`,
        { id: testBookId },
        adminToken,
      );
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.book.copyCounts.total).toBeDefined();
    });

    it('rejects unauthenticated requests to protected copy operations', async () => {
      const res = await gql(`
        query {
          copies { id }
        }
      `);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(
        /Authentication token missing|Unauthorized/i,
      );
    });
  });

  describe('3. Status transitions & Availability (AVAILABLE <-> LOST)', () => {
    let copyId: number;

    beforeAll(async () => {
      const list = await prisma.copy.findMany({
        where: { bookId: testBookId, status: CopyStatus.AVAILABLE },
      });
      copyId = list[0].id;
    });

    it('changing AVAILABLE -> LOST removes copy from availableCopies and LOST -> AVAILABLE restores it', async () => {
      // 1. Change AVAILABLE -> LOST
      const lostRes = await gql(
        `mutation ChangeStatus($id: Int!, $to: CopyStatus!, $reason: String) {
          changeCopyStatus(id: $id, to: $to, reason: $reason) {
            id
            status
          }
        }`,
        { id: copyId, to: 'LOST', reason: 'Misplaced in reference section' },
        librarianToken,
      );
      expect(lostRes.body.errors).toBeUndefined();
      expect(lostRes.body.data.changeCopyStatus.status).toBe('LOST');

      // availableCopies decreased from 3 to 2
      const bookAfterLost = await gql(
        `query { book(id: ${testBookId}) { availableCopies } }`,
      );
      expect(bookAfterLost.body.data.book.availableCopies).toBe(2);

      // 2. Change LOST -> AVAILABLE
      const restoredRes = await gql(
        `mutation ChangeStatus($id: Int!, $to: CopyStatus!, $reason: String) {
          changeCopyStatus(id: $id, to: $to, reason: $reason) {
            id
            status
          }
        }`,
        { id: copyId, to: 'AVAILABLE', reason: 'Found on return cart' },
        librarianToken,
      );
      expect(restoredRes.body.errors).toBeUndefined();
      expect(restoredRes.body.data.changeCopyStatus.status).toBe('AVAILABLE');

      // availableCopies restored back to 3
      const bookAfterRestore = await gql(
        `query { book(id: ${testBookId}) { availableCopies } }`,
      );
      expect(bookAfterRestore.body.data.book.availableCopies).toBe(3);
    });

    it('rejects manual transitions to ON_HOLD or BORROWED', async () => {
      const holdRes = await gql(
        `mutation {
          changeCopyStatus(id: ${copyId}, to: ON_HOLD, reason: "Manual hold") { id }
        }`,
        {},
        librarianToken,
      );
      expect(holdRes.body.errors).toBeDefined();
      expect(holdRes.body.errors[0].message).toMatch(
        /cannot be set manually|cannot transition/i,
      );

      const borrowRes = await gql(
        `mutation {
          changeCopyStatus(id: ${copyId}, to: BORROWED, reason: "Manual loan") { id }
        }`,
        {},
        librarianToken,
      );
      expect(borrowRes.body.errors).toBeDefined();
      expect(borrowRes.body.errors[0].message).toMatch(
        /cannot be set manually|cannot transition/i,
      );
    });

    it('requires a reason when transitioning to LOST or DAMAGED', async () => {
      const res = await gql(
        `mutation {
          changeCopyStatus(id: ${copyId}, to: LOST) { id }
        }`,
        {},
        librarianToken,
      );
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(/reason is required/i);
    });
  });

  describe('4. Retirement', () => {
    let copyId: number;

    beforeAll(async () => {
      const list = await prisma.copy.findMany({
        where: { bookId: testBookId, status: CopyStatus.AVAILABLE },
      });
      copyId = list[0].id;
    });

    it('hides retired copies by default and excludes them from availability', async () => {
      // Retire the copy
      const retireRes = await gql(
        `mutation Retire($id: Int!, $reason: String) {
          retireCopy(id: $id, reason: $reason) {
            id
            retiredAt
          }
        }`,
        { id: copyId, reason: 'Permanently damaged beyond repair' },
        librarianToken,
      );
      expect(retireRes.body.errors).toBeUndefined();
      expect(retireRes.body.data.retireCopy.retiredAt).toBeDefined();

      // copies() query without includeRetired hides it
      const defaultListRes = await gql(
        `query GetCopies($bookId: Int) {
          copies(bookId: $bookId) {
            id
          }
        }`,
        { bookId: testBookId },
        librarianToken,
      );
      const copyIds = defaultListRes.body.data.copies.map((c: any) =>
        Number(c.id),
      );
      expect(copyIds).not.toContain(copyId);

      // copies(includeRetired: true) includes it
      const withRetiredRes = await gql(
        `query GetCopies($bookId: Int, $includeRetired: Boolean) {
          copies(bookId: $bookId, includeRetired: $includeRetired) {
            id
            retiredAt
          }
        }`,
        { bookId: testBookId, includeRetired: true },
        librarianToken,
      );
      const allIds = withRetiredRes.body.data.copies.map((c: any) =>
        Number(c.id),
      );
      expect(allIds).toContain(copyId);

      // availableCopies was 3, now is 2
      const bookRes = await gql(
        `query { book(id: ${testBookId}) { availableCopies } }`,
      );
      expect(bookRes.body.data.book.availableCopies).toBe(2);
    });
  });

  describe('5. Concurrency Test: Atomic Compare-and-Set Conflict Behavior', () => {
    it('fires two conflicting transitionStatus calls concurrently: exactly ONE succeeds and the other fails with conflict', async () => {
      // Create a fresh copy specifically for the race condition test
      const copy = await prisma.copy.create({
        data: {
          bookId: testBookId,
          barcode: `CONCUR-${Date.now()}`,
          status: CopyStatus.AVAILABLE,
        },
      });

      // Concurrently fire two conflicting transitionStatus calls specifying allowedFrom: [AVAILABLE]
      const [res1, res2] = await Promise.allSettled([
        copiesService.transitionStatus(
          copy.id,
          [CopyStatus.AVAILABLE],
          CopyStatus.LOST,
          { reason: 'Race LOST', changedById: librarianUserId },
        ),
        copiesService.transitionStatus(
          copy.id,
          [CopyStatus.AVAILABLE],
          CopyStatus.DAMAGED,
          { reason: 'Race DAMAGED', changedById: librarianUserId },
        ),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const conflictError = (rejected[0] as PromiseRejectedResult).reason;
      expect(conflictError.message).toMatch(/not in allowed source statuses/i);
    });
  });

  describe('6. History Table Auditing', () => {
    it('records every status change with actorId and reason in order', async () => {
      // Fetch copy status history for the first copy created
      const copy = await prisma.copy.findFirst({
        where: { bookId: testBookId },
      });

      const historyRes = await gql(
        `query GetHistory($copyId: Int!) {
          copyStatusHistory(copyId: $copyId) {
            id
            copyId
            fromStatus
            toStatus
            reason
            changedById
            createdAt
          }
        }`,
        { copyId: copy!.id },
        librarianToken,
      );

      expect(historyRes.body.errors).toBeUndefined();
      const history = historyRes.body.data.copyStatusHistory;
      expect(history.length).toBeGreaterThan(0);

      // History is ordered by createdAt desc, so the latest entry should have librarian's id
      const latest = history[0];
      expect(latest.changedById).toBe(librarianUserId);
      expect(latest.reason).toBeDefined();
    });
  });
});
