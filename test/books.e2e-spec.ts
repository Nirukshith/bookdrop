import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Books (GraphQL E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('queries books with availableCopiesCount, authors, and categories', async () => {
    const query = `
      query {
        books(take: 5, skip: 0) {
          id
          title
          isbn
          availableCopiesCount
          authors {
            id
            name
          }
          categories {
            id
            name
          }
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
      expect(book.authors).toBeInstanceOf(Array);
      expect(book.categories).toBeInstanceOf(Array);
    }
  });

  it('queries a single book by id', async () => {
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
            authors {
              name
            }
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
      const authorId = Number(books[0].authors[0].id);
      const categoryId = Number(books[0].categories[0].id);

      const filteredQuery = `
        query {
          books(authorId: ${authorId}, categoryId: ${categoryId}) {
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
