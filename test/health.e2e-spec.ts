import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Health Endpoints (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health/live', () => {
    it('returns 200 and healthy status without checking database', async () => {
      const querySpy = jest.spyOn(prisma, '$queryRaw');

      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info?.app?.status).toBe('up');
      expect(querySpy).not.toHaveBeenCalled();

      querySpy.mockRestore();
    });

    it('is public and accessible without a JWT Authorization token', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('is exempt from rate limiting when probed repeatedly', async () => {
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer()).get('/health/live');
        expect(res.status).toBe(200);
      }
    });

    it('includes Helmet security headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when PostgreSQL is connected', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info?.database?.status).toBe('up');
    });

    it('is public and accessible without a JWT Authorization token', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('is exempt from rate limiting when probed repeatedly', async () => {
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer()).get('/health/ready');
        expect(res.status).toBe(200);
      }
    });

    it('returns 503 and sanitizes sensitive errors when database is down', async () => {
      const sensitiveSecret = 'super-secret-password-123';
      const internalDbError = new Error(
        `Connection failed at postgresql://postgres:${sensitiveSecret}@postgres.prod.internal:5432/bookdrop`,
      );

      const querySpy = jest
        .spyOn(prisma, '$queryRaw')
        .mockRejectedValueOnce(internalDbError);

      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(res.body.status).toBe('error');
      expect(res.body.error?.database?.status).toBe('down');
      expect(res.body.error?.database?.message).toBe('Database unreachable');

      // Verify no sensitive connection string or stack trace leaks
      const rawBody = JSON.stringify(res.body);
      expect(rawBody).not.toContain(sensitiveSecret);
      expect(rawBody).not.toContain('postgresql://');
      expect(rawBody).not.toContain('postgres.prod.internal');
      expect(rawBody).not.toContain('stack');

      querySpy.mockRestore();
    });

    it('includes Helmet security headers even on 503 response', async () => {
      const querySpy = jest
        .spyOn(prisma, '$queryRaw')
        .mockRejectedValueOnce(new Error('Simulated failure'));

      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();

      querySpy.mockRestore();
    });
  });
});
