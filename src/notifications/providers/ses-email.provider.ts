import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import {
  EmailProvider,
  PermanentEmailError,
  SendEmailOptions,
  SendEmailResult,
  TransientEmailError,
} from './email-provider.interface';

export interface SesConfig {
  region: string;
  from: string;
  fromName?: string;
  client?: SESClient;
}

@Injectable()
export class SesEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SesEmailProvider.name);
  private readonly client: SESClient;
  private readonly defaultFrom: string;

  constructor(config?: Partial<SesConfig>) {
    const nodeEnv = process.env.NODE_ENV;

    // Safety rule: SesEmailProvider is strictly prohibited from running in non-production environments
    if (nodeEnv !== 'production') {
      throw new Error(
        `Safety violation: SesEmailProvider is strictly forbidden from starting when NODE_ENV is not 'production' (current NODE_ENV="${nodeEnv}"). Real emails cannot be dispatched from developer machines or automated tests. Use 'console' or 'smtp' instead.`,
      );
    }

    const region = config?.region || process.env.SES_REGION;
    const from = config?.from || process.env.EMAIL_FROM;
    const fromName =
      config?.fromName || process.env.EMAIL_FROM_NAME || 'Bookdrop Library';

    if (!from || !region) {
      throw new Error(
        'SesEmailProvider configuration error: EMAIL_FROM and SES_REGION are strictly required in production.',
      );
    }

    this.defaultFrom = `"${fromName}" <${from}>`;
    this.client = config?.client || new SESClient({ region });
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const command = new SendEmailCommand({
        Source: options.from || this.defaultFrom,
        Destination: {
          ToAddresses: [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: options.html,
              Charset: 'UTF-8',
            },
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
          },
        },
      });

      const response = await this.client.send(command);
      return { messageId: response.MessageId || `ses-${Date.now()}` };
    } catch (err: any) {
      const errorName = err.name as string | undefined;

      // Transient SES errors (rate limiting throttling, service temporary failure)
      if (
        errorName === 'ThrottlingException' ||
        errorName === 'ServiceUnavailableException' ||
        errorName === 'RequestTimeout' ||
        err.$metadata?.httpStatusCode === 429 ||
        (err.$metadata?.httpStatusCode >= 500 &&
          err.$metadata?.httpStatusCode < 600)
      ) {
        throw new TransientEmailError(
          `AWS SES transient delivery error (${errorName || '5xx'}): ${err.message}`,
          err,
        );
      }

      // Permanent SES errors (unverified address, malformed recipient, rejected message)
      if (
        errorName === 'MessageRejected' ||
        errorName === 'MailboxDoesNotExistException' ||
        errorName === 'InvalidParameterValue' ||
        errorName === 'AccountSendingPausedException' ||
        err.$metadata?.httpStatusCode === 400
      ) {
        throw new PermanentEmailError(
          `AWS SES permanent rejection (${errorName}): ${err.message}`,
          err,
        );
      }

      throw new TransientEmailError(
        `AWS SES unexpected delivery failure: ${err.message}`,
        err,
      );
    }
  }
}
