import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClockModule } from '../../common/clock/clock.module';
import { HoldsModule } from '../holds/holds.module';
import { JobRunnerService } from './job-runner.service';
import { JobsScheduler } from './jobs.scheduler';
import { ExpireHoldsJob } from './implementations/expire-holds.job';
import { SendRemindersJob } from './implementations/send-reminders.job';
import { JobsResolver } from './jobs.resolver';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    ClockModule,
    forwardRef(() => HoldsModule),
  ],
  providers: [
    JobRunnerService,
    JobsScheduler,
    ExpireHoldsJob,
    SendRemindersJob,
    JobsResolver,
  ],
  exports: [JobRunnerService, JobsScheduler, ExpireHoldsJob, SendRemindersJob],
})
export class JobsModule implements OnModuleInit {
  constructor(
    private readonly jobRunner: JobRunnerService,
    private readonly expireHoldsJob: ExpireHoldsJob,
    private readonly sendRemindersJob: SendRemindersJob,
  ) {}

  onModuleInit(): void {
    this.jobRunner.registerJob(this.expireHoldsJob);
    this.jobRunner.registerJob(this.sendRemindersJob);
    // Backward-compatible alias
    this.jobRunner.registerJob({
      name: 'reminders',
      intervalSeconds: this.sendRemindersJob.intervalSeconds,
      run: (ctx) => this.sendRemindersJob.run(ctx),
    });
  }
}
