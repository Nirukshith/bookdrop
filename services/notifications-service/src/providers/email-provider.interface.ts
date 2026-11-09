export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export abstract class EmailDeliveryError extends Error {
  public abstract readonly isRetryable: boolean;

  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Transient error (temporary network failure, rate limit throttling, server 5xx).
 * Indicates the notification should be retried with exponential backoff.
 */
export class TransientEmailError extends EmailDeliveryError {
  public readonly isRetryable = true;

  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    this.name = 'TransientEmailError';
  }
}

/**
 * Permanent error (invalid recipient address syntax, suppressed recipient, rejected by policy).
 * Indicates the notification will never succeed and must transition directly to FAILED.
 */
export class PermanentEmailError extends EmailDeliveryError {
  public readonly isRetryable = false;

  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    this.name = 'PermanentEmailError';
  }
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}
