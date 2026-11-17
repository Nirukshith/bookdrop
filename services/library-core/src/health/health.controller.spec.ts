import { HealthCheckError, HealthCheckService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let dbIndicator: DatabaseHealthIndicator;
  let prismaService: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        DatabaseHealthIndicator,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn((indicators) =>
              Promise.all(indicators.map((fn: () => any) => fn())).then(
                (results) => {
                  const info: Record<string, any> = {};
                  for (const res of results) {
                    Object.assign(info, res);
                  }
                  return {
                    status: 'ok',
                    info,
                    error: {},
                    details: info,
                  };
                },
              ),
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    dbIndicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(dbIndicator).toBeDefined();
  });

  describe('GET /health/live', () => {
    it('returns status ok without querying the database', async () => {
      const dbSpy = jest.spyOn(dbIndicator, 'isHealthy');

      const result = await controller.checkLive();

      expect(result.status).toBe('ok');
      expect(result.info?.app).toEqual({ status: 'up' });
      expect(prismaService.$queryRaw).not.toHaveBeenCalled();
      expect(dbSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('returns status ok when database is reachable', async () => {
      prismaService.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const result = await controller.checkReady();

      expect(result.status).toBe('ok');
      expect(result.info?.database).toEqual({ status: 'up' });
      expect(prismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('throws HealthCheckError and masks internal details when database is unreachable', async () => {
      const sensitiveDbError = new Error(
        'FATAL: password authentication failed for user "postgres" at postgresql://postgres:supersecret@db.internal:5432/bookdrop',
      );
      prismaService.$queryRaw.mockRejectedValueOnce(sensitiveDbError);

      try {
        await controller.checkReady();
        fail('Expected checkReady to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HealthCheckError);
        expect(err.causes).toBeDefined();
        expect(err.causes.database).toEqual({
          status: 'down',
          message: 'Database unreachable',
        });

        // Ensure sensitive connection string or stack trace is not present in causes
        const serialized = JSON.stringify(err.causes);
        expect(serialized).not.toContain('supersecret');
        expect(serialized).not.toContain('postgresql://');
        expect(serialized).not.toContain('FATAL');
      }
    });
  });

  describe('DatabaseHealthIndicator', () => {
    it('returns status up when query succeeds', async () => {
      prismaService.$queryRaw.mockResolvedValueOnce([{ '1': 1 }]);

      const result = await dbIndicator.isHealthy('database');

      expect(result).toEqual({
        database: { status: 'up' },
      });
    });

    it('throws HealthCheckError with sanitized message when query fails', async () => {
      prismaService.$queryRaw.mockRejectedValueOnce(
        new Error('Connection timeout'),
      );

      await expect(dbIndicator.isHealthy('database')).rejects.toThrow(
        HealthCheckError,
      );
    });
  });
});
