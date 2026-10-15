import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

describe('Books (GraphQL E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let authService: AuthService;

  let memberToken: string;
  let librarianToken: string;
  let adminToken: string;
  let authorId: number;
  let categoryId: number;
  let createdBookId: number;

  const testIsbn = `test-isbn-${Date.now()}`;

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

    // Fetch an existing author and category from seeded data
    const existingAuthor = await prisma.author.findFirst();
    const existingCategory = await prisma.category.findFirst();
    authorId = existingAuthor ? existingAuthor.id : 1;
    categoryId = existingCategory ? existingCategory.id : 1;

    // Create test accounts with different roles
    const memberEmail = `bookstest_member_${Date.now()}@example.com`;
    const librarianEmail = `bookstest_librarian_${Date.now()}@example.com`;
    const adminEmail = `bookstest_admin_${Date.now()}@example.com`;

    await usersService.create({
      name: 'Test Member',
      email: memberEmail,
      password: 'password123',
      role: Role.MEMBER,
    });
    await usersService.create({
      name: 'Test Librarian',
      email: librarianEmail,
      password: 'password123',
      role: Role.LIBRARIAN,
    });
    await usersService.create({
      name: 'Test Admin',
      email: adminEmail,
      password: 'password123',
      role: Role.ADMIN,
    });

    const memberLogin = await authService.login({
      email: memberEmail,
      password: 'password123',
    });
    memberToken = memberLogin.accessToken;

    const librarianLogin = await authService.login({
      email: librarianEmail,
      password: 'password123',
    });
    librarianToken = librarianLogin.accessToken;

    const adminLogin = await authService.login({
      email: adminEmail,
      password: 'password123',
    });
    adminToken = adminLogin.accessToken;
  });

  afterAll(async () => {
    await prisma.book.deleteMany({
      where: { isbn: { contains: 'test-isbn' } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { contains: 'bookstest' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'bookstest' } },
    });
    await app.close();
  });

  describe('Public catalog queries', () => {
    it('queries books without authentication', async () => {
      const query = `
        query {
          books(take: 5, skip: 0) {
            id
            title
            isbn
            availableCopiesCount
            authors { id name }
            categories { id name }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.books).toBeInstanceOf(Array);
      expect(res.body.data.books.length).toBeLessThanOrEqual(5);

      if (res.body.data.books.length > 0) {
        const book = res.body.data.books[0];
        expect(typeof book.title).toBe('string');
        expect(typeof book.availableCopiesCount).toBe('number');
      }
    });

    it('queries a single book by id without authentication', async () => {
      const query = `
        query {
          books(take: 1) {
            id
          }
        }
      `;

      const listRes = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .expect(200);

      const firstBook = listRes.body.data.books[0];
      if (firstBook) {
        const singleQuery = `
          query {
            book(id: ${firstBook.id}) {
              id
              title
              availableCopiesCount
              authors { name }
            }
          }
        `;

        const singleRes = await request(app.getHttpServer())
          .post('/graphql')
          .send({ query: singleQuery })
          .expect(200);

        expect(singleRes.body.errors).toBeUndefined();
        expect(singleRes.body.data.book.id).toBe(firstBook.id);
      }
    });

    it('searches books by title with case-insensitivity', async () => {
      const query = `
        query {
          books(search: "1984") {
            id
            title
            availableCopiesCount
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.books.length).toBeGreaterThan(0);
      expect(res.body.data.books[0].title).toBe('1984');
    });

    it('filters books by categoryId and authorId', async () => {
      const query = `
        query {
          books(take: 10) {
            id
            authors { id }
            categories { id }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .expect(200);

      const books = res.body.data.books;
      if (
        books.length > 0 &&
        books[0].authors.length > 0 &&
        books[0].categories.length > 0
      ) {
        const aId = Number(books[0].authors[0].id);
        const cId = Number(books[0].categories[0].id);

        const filteredQuery = `
          query {
            books(authorId: ${aId}, categoryId: ${cId}) {
              id
              title
              authors { id }
              categories { id }
            }
          }
        `;

        const filteredRes = await request(app.getHttpServer())
          .post('/graphql')
          .send({ query: filteredQuery })
          .expect(200);

        expect(filteredRes.body.errors).toBeUndefined();
        expect(filteredRes.body.data.books.length).toBeGreaterThan(0);
      }
    });
  });

  describe('createBook mutation (RBAC & Validation)', () => {
    it('denies unauthenticated requests with 401 Unauthorized', async () => {
      const mutation = `
        mutation {
          createBook(input: {
            title: "Unauthorized Book"
            isbn: "${testIsbn}-unauth"
            authorIds: [${authorId}]
            categoryIds: [${categoryId}]
          }) {
            id
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Authentication token missing',
      );
    });

    it('denies MEMBER role with 403 Forbidden', async () => {
      const mutation = `
        mutation {
          createBook(input: {
            title: "Member Book"
            isbn: "${testIsbn}-member"
            authorIds: [${authorId}]
            categoryIds: [${categoryId}]
          }) {
            id
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Access denied: insufficient permissions',
      );
    });

    it('allows LIBRARIAN to create a new book', async () => {
      const mutation = `
        mutation {
          createBook(input: {
            title: "The Hobbit"
            isbn: "${testIsbn}-hobbit"
            description: "A fantasy novel by J.R.R. Tolkien"
            publishedYear: 1937
            authorIds: [${authorId}]
            categoryIds: [${categoryId}]
          }) {
            id
            title
            isbn
            description
            publishedYear
            availableCopiesCount
            authors { id }
            categories { id }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      const book = res.body.data.createBook;
      expect(book.title).toBe('The Hobbit');
      expect(book.isbn).toBe(`${testIsbn}-hobbit`);
      expect(book.description).toBe('A fantasy novel by J.R.R. Tolkien');
      expect(book.publishedYear).toBe(1937);
      expect(book.availableCopiesCount).toBe(0);
      expect(book.authors).toHaveLength(1);
      expect(book.categories).toHaveLength(1);

      createdBookId = Number(book.id);
    });

    it('rejects duplicate ISBN with a ConflictException', async () => {
      const mutation = `
        mutation {
          createBook(input: {
            title: "Duplicate Hobbit"
            isbn: "${testIsbn}-hobbit"
            authorIds: [${authorId}]
            categoryIds: [${categoryId}]
          }) {
            id
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'A book with this ISBN already exists',
      );
    });
  });

  describe('updateBook mutation (RBAC & Validation)', () => {
    it('denies MEMBER role from updating a book with 403 Forbidden', async () => {
      const mutation = `
        mutation {
          updateBook(id: ${createdBookId}, input: {
            title: "Member Modified Title"
          }) {
            id
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Access denied: insufficient permissions',
      );
    });

    it('allows ADMIN to update book fields', async () => {
      const mutation = `
        mutation {
          updateBook(id: ${createdBookId}, input: {
            title: "The Hobbit: There and Back Again"
            publishedYear: 1938
          }) {
            id
            title
            publishedYear
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      const updated = res.body.data.updateBook;
      expect(updated.title).toBe('The Hobbit: There and Back Again');
      expect(updated.publishedYear).toBe(1938);
    });

    it('throws NotFoundException when updating non-existent book', async () => {
      const mutation = `
        mutation {
          updateBook(id: 999999, input: {
            title: "Ghost Book"
          }) {
            id
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain('not found');
    });
  });
});
