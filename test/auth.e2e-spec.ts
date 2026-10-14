import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (GraphQL E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    // Clean up test users and refresh tokens before running auth E2E tests
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { contains: 'authtest' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'authtest' } },
    });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { contains: 'authtest' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'authtest' } },
    });
    await app.close();
  });

  const testEmail = `authtest_${Date.now()}@example.com`;
  let activeRefreshToken = '';

  it('registers a new user as MEMBER and returns tokens and user profile', async () => {
    const mutation = `
      mutation {
        register(input: {
          name: "Test Member"
          email: "${testEmail}"
          password: "securePassword123"
        }) {
          accessToken
          refreshToken
          user {
            id
            name
            email
            role
          }
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);

    expect(res.body.errors).toBeUndefined();
    const data = res.body.data.register;
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    expect(data.user.email).toBe(testEmail.toLowerCase());
    expect(data.user.role).toBe('MEMBER');
  });

  it('rejects duplicate email registration with a conflict error', async () => {
    const mutation = `
      mutation {
        register(input: {
          name: "Duplicate User"
          email: "${testEmail}"
          password: "anotherPassword123"
        }) {
          accessToken
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].message).toContain('Email is already registered');
  });

  it('logs in successfully and returns fresh tokens', async () => {
    const mutation = `
      mutation {
        login(input: {
          email: "${testEmail}"
          password: "securePassword123"
        }) {
          accessToken
          refreshToken
          user {
            id
            role
          }
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);

    expect(res.body.errors).toBeUndefined();
    const data = res.body.data.login;
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    activeRefreshToken = data.refreshToken;
  });

  it('fails login with generic "Invalid credentials" error on incorrect password', async () => {
    const mutation = `
      mutation {
        login(input: {
          email: "${testEmail}"
          password: "wrongPassword999"
        }) {
          accessToken
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].message).toBe('Invalid credentials');
  });

  it('fails login with generic "Invalid credentials" error on unknown email', async () => {
    const mutation = `
      mutation {
        login(input: {
          email: "unknown_authtest_user@example.com"
          password: "somePassword123"
        }) {
          accessToken
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].message).toBe('Invalid credentials');
  });

  it('rotates refresh token and returns new token pair', async () => {
    const mutation = `
      mutation {
        refreshTokens(refreshToken: "${activeRefreshToken}") {
          accessToken
          refreshToken
          user {
            email
          }
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);

    expect(res.body.errors).toBeUndefined();
    const data = res.body.data.refreshTokens;
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    expect(data.refreshToken).not.toBe(activeRefreshToken);

    const oldToken = activeRefreshToken;
    activeRefreshToken = data.refreshToken;

    // Reuse detection test: Presenting the old (already rotated) token must fail
    // and invalidate all tokens for this user!
    const reuseMutation = `
      mutation {
        refreshTokens(refreshToken: "${oldToken}") {
          accessToken
        }
      }
    `;

    const reuseRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: reuseMutation })
      .expect(200);

    expect(reuseRes.body.errors).toBeDefined();
    expect(reuseRes.body.errors[0].message).toContain(
      'Invalid or expired refresh token',
    );

    // Because reuse was detected, the newest activeRefreshToken should also have been revoked
    const nextTryRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation {
            refreshTokens(refreshToken: "${activeRefreshToken}") {
              accessToken
            }
          }
        `,
      })
      .expect(200);

    expect(nextTryRes.body.errors).toBeDefined();
    expect(nextTryRes.body.errors[0].message).toContain(
      'Invalid or expired refresh token',
    );
  });

  it('revokes refresh token upon logout', async () => {
    // First, login fresh to obtain a valid token
    const loginRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation {
            login(input: {
              email: "${testEmail}"
              password: "securePassword123"
            }) {
              refreshToken
            }
          }
        `,
      })
      .expect(200);

    const tokenToRevoke = loginRes.body.data.login.refreshToken;

    // Logout
    const logoutRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation {
            logout(refreshToken: "${tokenToRevoke}")
          }
        `,
      })
      .expect(200);

    expect(logoutRes.body.errors).toBeUndefined();
    expect(logoutRes.body.data.logout).toBe(true);

    // Attempting to refresh with the logged-out token should fail
    const refreshRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation {
            refreshTokens(refreshToken: "${tokenToRevoke}") {
              accessToken
            }
          }
        `,
      })
      .expect(200);

    expect(refreshRes.body.errors).toBeDefined();
  });
});
