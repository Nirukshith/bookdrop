import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClockModule } from '../../common/clock/clock.module';
import { JobRunnerService } from './job-runner.service';
import { JobsScheduler } from './jobs.scheduler';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule, PrismaModule, ClockModule],
  providers: [JobRunnerService, JobsScheduler],
  exports: [JobRunnerService, JobsScheduler],
})
export class JobsModule {}
