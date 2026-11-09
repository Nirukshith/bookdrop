import { Injectable } from '@nestjs/common';
import {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';

export interface RecordedEmail extends SendEmailOptions {
  messageId: string;
  sentAt: Date;
}

@Injectable()
export class FakeEmailProvider implements EmailProvider {
  private readonly sentEmails: RecordedEmail[] = [];
  private persistentFailure: Error | null = null;
  private nextFailure: Error | null = null;

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (this.nextFailure) {
      const err = this.nextFailure;
      this.nextFailure = null;
      throw err;
    }

    if (this.persistentFailure) {
      throw this.persistentFailure;
    }

    const messageId = `fake-${Date.now()}-${this.sentEmails.length + 1}`;
    this.sentEmails.push({
      ...options,
      messageId,
      sentAt: new Date(),
    });

    return { messageId };
  }

  getSentEmails(): ReadonlyArray<RecordedEmail> {
    return [...this.sentEmails];
  }

  clear(): void {
    this.sentEmails.length = 0;
    this.persistentFailure = null;
    this.nextFailure = null;
  }

  simulateNextFailure(error: Error): void {
    this.nextFailure = error;
  }

  simulateFailure(error: Error | null): void {
    this.persistentFailure = error;
  }
}
