import { Injectable, Logger } from '@nestjs/common';
import {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';
import { maskEmail } from '../utils/email-formatter.util';

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const maskedTo = maskEmail(options.to);
    const messageId = `console-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.logger.log(
      `[EMAIL SENT via ConsoleProvider] ID="${messageId}" To="${maskedTo}" Subject="${options.subject}" BodyLength=${options.text.length}`,
    );

    return { messageId };
  }
}

