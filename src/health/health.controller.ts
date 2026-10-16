import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { DatabaseHealthIndicator } from './database.health';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @Public()
  @SkipThrottle()
  @HealthCheck()
  async checkLive(): Promise<HealthCheckResult> {
    return this.health.check([() => ({ app: { status: 'up' } })]);
  }

  @Get('ready')
  @Public()
  @SkipThrottle()
  @HealthCheck()
  async checkReady(): Promise<HealthCheckResult> {
    return this.health.check([() => this.dbIndicator.isHealthy('database')]);
  }
}
