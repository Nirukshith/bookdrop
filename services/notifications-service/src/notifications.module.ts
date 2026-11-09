import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsSubscriber } from './notifications.subscriber';
import { SendNotificationsJob } from './jobs/send-notifications.job';
import { TokenBucketRateLimiter } from './rate-limiter/token-bucket.rate-limiter';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { SesEmailProvider } from './providers/ses-email.provider';

@Module({
  controllers: [NotificationsConsumer],
  providers: [
    NotificationsSubscriber,
    SendNotificationsJob,
    {
      provide: 'EMAIL_RATE_LIMITER',
      useFactory: (configService: ConfigService) => {
        const rps = configService.get<number>(
          'NOTIFICATION_RATE_LIMIT_RPS',
          1,
        );
        const burst = configService.get<number>(
          'NOTIFICATION_BURST_CAPACITY',
          5,
        );
        return new TokenBucketRateLimiter({
          maxPerSecond: rps,
          capacity: burst,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'EMAIL_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const providerType = configService.get<string>(
          'EMAIL_PROVIDER',
          'console',
        );
        switch (providerType) {
          case 'smtp':
            return new SmtpEmailProvider({
              host: configService.get<string>('SMTP_HOST', 'localhost'),
              port: configService.get<number>('SMTP_PORT', 1025),
              user: configService.get<string>('SMTP_USER', ''),
              pass: configService.get<string>('SMTP_PASS', ''),
              from: configService.get<string>(
                'EMAIL_FROM',
                'Bookdrop Library <no-reply@bookdrop.io>',
              ),
            });
          case 'ses':
            return new SesEmailProvider({
              region: configService.get<string>('AWS_REGION', 'us-east-1'),
              from: configService.get<string>(
                'EMAIL_FROM',
                'Bookdrop Library <no-reply@bookdrop.io>',
              ),
            });
          case 'console':
          default:
            return new ConsoleEmailProvider();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [NotificationsSubscriber, SendNotificationsJob],
})
export class NotificationsModule {}

