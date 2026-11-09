import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  PermanentEmailError,
  SendEmailOptions,
  SendEmailResult,
  TransientEmailError,
} from './email-provider.interface';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  fromName?: string;
}

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  constructor(@Optional() config?: Partial<SmtpConfig>) {
    const host = config?.host || process.env.SMTP_HOST || 'localhost';
    const port = config?.port || Number(process.env.SMTP_PORT) || 587;
    const user = config?.user || process.env.SMTP_USER;
    const pass = config?.pass || process.env.SMTP_PASS;
    const from =
      config?.from || process.env.EMAIL_FROM || 'noreply@bookdrop.io';
    const fromName =
      config?.fromName || process.env.EMAIL_FROM_NAME || 'Bookdrop Library';

    this.defaultFrom = `"${fromName}" <${from}>`;

    const auth = user && pass ? { user, pass } : undefined;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: options.from || this.defaultFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return { messageId: info.messageId || `smtp-${Date.now()}` };
    } catch (err: any) {
      const responseCode = err.responseCode ? Number(err.responseCode) : null;
      const code = err.code as string | undefined;

      // 4xx SMTP status or network timeout/refusal is transient/retryable
      if (
        (responseCode && responseCode >= 400 && responseCode < 500) ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'EHOSTUNREACH'
      ) {
        throw new TransientEmailError(
          `SMTP transient delivery error: ${err.message}`,
          err,
        );
      }

      // 5xx SMTP status indicates permanent rejection (e.g. mailbox unavailable, invalid user)
      if (responseCode && responseCode >= 500 && responseCode < 600) {
        throw new PermanentEmailError(
          `SMTP permanent delivery rejection (${responseCode}): ${err.message}`,
          err,
        );
      }

      // Default network/unknown failures to transient so backoff is attempted
      throw new TransientEmailError(
        `SMTP delivery failed: ${err.message}`,
        err,
      );
    }
  }
}
