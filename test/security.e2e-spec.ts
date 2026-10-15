import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';

describe('Security Hardening (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      helmet({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: false,
      }),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Helmet HTTP Headers', () => {
    it('sets standard security headers on requests', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('GraphQL Query Depth Limiting', () => {
    it('allows queries within the depth limit of 5', async () => {
      const shallowQuery = `
        query {
          books(take: 1) {
            id
            title
            authors {
              id
              name
            }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: shallowQuery })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.books).toBeDefined();
    });

    it('rejects queries exceeding the maximum depth limit of 5', async () => {
      const deeplyNestedQuery = `
        query {
          books(take: 1) {
            authors {
              books {
                authors {
                  books {
                    authors {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: deeplyNestedQuery })
        .expect(400);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'exceeds maximum operation depth of 5',
      );
    });
  });

  describe('GraphQL Throttler (Rate Limiting)', () => {
    it('enforces rate limits on sensitive auth mutations', async () => {
      const loginMutation = `
        mutation {
          login(input: {
            email: "throttletest@example.com"
            password: "wrongpassword123"
          }) {
            accessToken
          }
        }
      `;

      let throttled = false;
      // The limit on login is 10 requests per 60s window
      for (let i = 0; i < 12; i++) {
        const res = await request(app.getHttpServer())
          .post('/graphql')
          .send({ query: loginMutation });

        if (
          res.body.errors &&
          res.body.errors.some((err: any) =>
            err.message.includes('Too Many Requests'),
          )
        ) {
          throttled = true;
          break;
        }
      }

      expect(throttled).toBe(true);
    });
  });

  describe('Production Introspection Disabling', () => {
    let prodApp: INestApplication;

    beforeAll(async () => {
      process.env.NODE_ENV = 'production';
      const prodFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      prodApp = prodFixture.createNestApplication();
      await prodApp.init();
    });

    afterAll(async () => {
      process.env.NODE_ENV = 'test';
      await prodApp.close();
    });

    it('rejects introspection query when NODE_ENV is production', async () => {
      const introspectionQuery = `
        query {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

      const res = await request(prodApp.getHttpServer())
        .post('/graphql')
        .send({ query: introspectionQuery })
        .expect(400);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'introspection is not allowed',
      );
    });
  });
});
