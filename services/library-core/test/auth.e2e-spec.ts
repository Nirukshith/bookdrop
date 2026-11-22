import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { HoldStatus, Role } from '@prisma/client';

describe('Auth & Users (GraphQL E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;

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

  const memberEmail = `authtest_member_${Date.now()}@example.com`;
  const memberCardNo = `AT-${Date.now()}`;
  const adminEmail = `authtest_admin_${Date.now()}@example.com`;
  let memberAccessToken = '';
  let adminAccessToken = '';
  let activeRefreshToken = '';
  let memberUserId = 0;
  let adminUserId = 0;

  it('registers a new user as MEMBER and returns tokens and user profile', async () => {
    const mutation = `
      mutation {
        register(input: {
          name: "Test Member"
          email: "${memberEmail}"
          password: "securePassword123"
          membershipNumber: "${memberCardNo}"
        }) {
          accessToken
          refreshToken
          user {
            id
            name
            email
            role
            membershipNumber
            membershipStatus
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
    expect(data.user.email).toBe(memberEmail.toLowerCase());
    expect(data.user.role).toBe('MEMBER');
    expect(data.user.membershipNumber).toBe(memberCardNo.toUpperCase());
    expect(data.user.membershipStatus).toBe('PENDING');
    memberAccessToken = data.accessToken;
    memberUserId = Number(data.user.id);
  });

  it('rejects duplicate email registration with a conflict error', async () => {
    const mutation = `
      mutation {
        register(input: {
          name: "Duplicate User"
          email: "${memberEmail}"
          password: "anotherPassword123"
          membershipNumber: "${memberCardNo}-DUP"
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
          email: "${memberEmail}"
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
          email: "${memberEmail}"
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
    const loginRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation {
            login(input: {
              email: "${memberEmail}"
              password: "securePassword123"
            }) {
              refreshToken
            }
          }
        `,
      })
      .expect(200);

    const tokenToRevoke = loginRes.body.data.login.refreshToken;

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

  describe('me query', () => {
    it('returns current user profile when authenticated', async () => {
      // Re-login to get a fresh valid access token
      const loginRes = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(input: {
                email: "${memberEmail}"
                password: "securePassword123"
              }) {
                accessToken
              }
            }
          `,
        })
        .expect(200);

      const token = loginRes.body.data.login.accessToken;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: `
            query {
              me {
                id
                email
                role
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.me.email).toBe(memberEmail.toLowerCase());
      expect(res.body.data.me.role).toBe('MEMBER');
    });

    it('rejects unauthenticated me query with UnauthorizedException', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            query {
              me {
                id
                email
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Authentication token missing',
      );
    });
  });

  describe('users and updateUserRole (RBAC)', () => {
    beforeAll(async () => {
      // Create an admin user for RBAC testing
      const adminUser = await usersService.create({
        name: 'System Admin',
        email: adminEmail,
        password: 'adminPassword123',
        role: Role.ADMIN,
      });
      adminUserId = adminUser.id;

      // Login as admin
      const loginRes = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(input: {
                email: "${adminEmail}"
                password: "adminPassword123"
              }) {
                accessToken
              }
            }
          `,
        })
        .expect(200);

      adminAccessToken = loginRes.body.data.login.accessToken;
    });

    it('denies unauthenticated access to users query with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            query {
              users {
                id
                email
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Authentication token missing',
      );
    });

    it('denies access to users query for MEMBER role with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .send({
          query: `
            query {
              users {
                id
                email
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Access denied: insufficient permissions',
      );
    });

    it('allows ADMIN role to query all users', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          query: `
            query {
              users {
                id
                email
                role
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.users).toBeInstanceOf(Array);
      expect(res.body.data.users.length).toBeGreaterThan(0);
    });

    it('denies access to updateUserRole for MEMBER role with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .send({
          query: `
            mutation {
              updateUserRole(userId: ${memberUserId}, role: LIBRARIAN) {
                id
                role
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Access denied: insufficient permissions',
      );
    });

    it('allows ADMIN to update another user role to LIBRARIAN', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          query: `
            mutation {
              updateUserRole(userId: ${memberUserId}, role: LIBRARIAN) {
                id
                role
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserRole.role).toBe('LIBRARIAN');
    });

    it('prevents an ADMIN from removing their own admin role', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          query: `
            mutation {
              updateUserRole(userId: ${adminUserId}, role: MEMBER) {
                id
                role
              }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain(
        'Admins cannot remove their own admin role',
      );
    });
  });

  describe('Membership approval flow', () => {
    const applicantEmail = `authtest_applicant_${Date.now()}@example.com`;
    const applicantCardNo = `APP-${Date.now()}`;
    let applicantToken = '';
    let applicantId = 0;
    let bookId = 0;

    const gql = (query: string, token?: string) => {
      const req = request(app.getHttpServer()).post('/graphql');
      if (token) req.set('Authorization', `Bearer ${token}`);
      return req.send({ query }).expect(200);
    };

    beforeAll(async () => {
      const copy = await prisma.copy.findFirst({
        where: { status: 'AVAILABLE' },
        select: { bookId: true },
      });
      if (!copy) throw new Error('Seeded catalog needs an AVAILABLE copy');
      bookId = copy.bookId;

      const res = await gql(`
        mutation {
          register(input: {
            name: "Applicant"
            email: "${applicantEmail}"
            password: "securePassword123"
            membershipNumber: "${applicantCardNo}"
          }) { accessToken user { id membershipStatus } }
        }
      `);
      expect(res.body.errors).toBeUndefined();
      applicantToken = res.body.data.register.accessToken;
      applicantId = Number(res.body.data.register.user.id);
      expect(res.body.data.register.user.membershipStatus).toBe('PENDING');
    });

    afterAll(async () => {
      await prisma.hold.deleteMany({ where: { userId: applicantId } });
    });

    it('rejects registering a membership number that is already in use', async () => {
      const res = await gql(`
        mutation {
          register(input: {
            name: "Copycat"
            email: "authtest_copycat_${Date.now()}@example.com"
            password: "securePassword123"
            membershipNumber: "${applicantCardNo.toLowerCase()}"
          }) { accessToken }
        }
      `);
      expect(res.body.errors[0].message).toContain(
        'This membership number is already registered',
      );
    });

    it('blocks a PENDING member from requesting a hold', async () => {
      const res = await gql(
        `mutation { requestHold(bookId: ${bookId}) { id } }`,
        applicantToken,
      );
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain('awaiting admin approval');
      expect(await prisma.hold.count({ where: { userId: applicantId } })).toBe(
        0,
      );
    });

    it('lists the applicant among pending applications for ADMIN only', async () => {
      const denied = await gql(
        `query { membershipApplications { id } }`,
        applicantToken,
      );
      expect(denied.body.errors[0].extensions.code).toBe('FORBIDDEN');

      const res = await gql(
        `query { membershipApplications { id membershipNumber membershipStatus } }`,
        adminAccessToken,
      );
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.membershipApplications).toEqual(
        expect.arrayContaining([
          {
            id: String(applicantId),
            membershipNumber: applicantCardNo.toUpperCase(),
            membershipStatus: 'PENDING',
          },
        ]),
      );
    });

    it('does not let a member approve themselves', async () => {
      const res = await gql(
        `mutation { approveMembership(userId: ${applicantId}) { id } }`,
        applicantToken,
      );
      expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
    });

    it('lets an ADMIN approve, after which the member can place a hold', async () => {
      const approved = await gql(
        `mutation { approveMembership(userId: ${applicantId}) { membershipStatus membershipReviewedAt } }`,
        adminAccessToken,
      );
      expect(approved.body.errors).toBeUndefined();
      expect(approved.body.data.approveMembership.membershipStatus).toBe(
        'APPROVED',
      );
      expect(
        approved.body.data.approveMembership.membershipReviewedAt,
      ).toBeTruthy();

      // Same access token as before approval: status is read fresh, not from the JWT
      const hold = await gql(
        `mutation { requestHold(bookId: ${bookId}) { id } }`,
        applicantToken,
      );
      expect(hold.body.errors).toBeUndefined();
      const holdId = Number(hold.body.data.requestHold.id);

      const cancelled = await gql(
        `mutation { cancelMyHold(holdId: ${holdId}) { status } }`,
        applicantToken,
      );
      expect(cancelled.body.errors).toBeUndefined();
      expect(cancelled.body.data.cancelMyHold.status).toBe(
        HoldStatus.CANCELLED,
      );
    });

    it('refuses to reject an already approved membership', async () => {
      const res = await gql(
        `mutation { rejectMembership(userId: ${applicantId}) { id } }`,
        adminAccessToken,
      );
      expect(res.body.errors[0].message).toContain(
        'Cannot reject a membership that is APPROVED',
      );
    });
  });
});
