import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users';
import { BooksModule } from '../books';
import { NotificationsSubscriber } from './notifications.subscriber';
import { SendNotificationsJob } from './jobs/send-notifications.job';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { SesEmailProvider } from './providers/ses-email.provider';
import { FakeEmailProvider } from './providers/fake-email.provider';
import { TokenBucketRateLimiter } from './rate-limiter/token-bucket.rate-limiter';
import { EmailProvider } from './providers/email-provider.interface';

@Module({
  imports: [PrismaModule, UsersModule, BooksModule],
  providers: [
    NotificationsSubscriber,
    SendNotificationsJob,
    ConsoleEmailProvider,
    SmtpEmailProvider,
    FakeEmailProvider,
    {
      provide: 'EMAIL_PROVIDER',
      useFactory: (): EmailProvider => {
        const providerType = (
          process.env.EMAIL_PROVIDER || 'console'
        ).toLowerCase();
        if (providerType === 'ses') {
          return new SesEmailProvider();
        }
        if (providerType === 'smtp') {
          return new SmtpEmailProvider();
        }
        return new ConsoleEmailProvider();
      },
    },
    {
      provide: 'EMAIL_RATE_LIMITER',
      useFactory: (): TokenBucketRateLimiter => {
        const maxPerSec = Number(process.env.EMAIL_MAX_PER_SECOND) || 1;
        return new TokenBucketRateLimiter({ maxPerSecond: maxPerSec });
      },
    },
  ],
  exports: [
    NotificationsSubscriber,
    SendNotificationsJob,
    'EMAIL_PROVIDER',
    'EMAIL_RATE_LIMITER',
    FakeEmailProvider,
  ],
})
export class NotificationsModule {}
