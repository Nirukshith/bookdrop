import { Logger } from '@nestjs/common';

export interface TransactionRetryOptions {
  /**
   * Maximum number of execution attempts. Defaults to 4.
   */
  maxAttempts?: number;

  /**
   * Minimum random backoff delay in milliseconds. Defaults to 25.
   */
  minDelayMs?: number;

  /**
   * Maximum random backoff delay in milliseconds. Defaults to 100.
   */
  maxDelayMs?: number;

  /**
   * Optional custom logger for recording retry warnings.
   */
  logger?: Logger;
}

export interface TransactionRetryContext {
  /**
   * Current attempt number, starting at 1.
   */
  attempt: number;

  /**
   * Register a callback to execute strictly AFTER the transaction attempt has succeeded.
   * If the attempt fails and is retried, callbacks registered in that attempt are discarded.
   */
  onCommit: (callback: () => void | Promise<void>) => void;
}

const defaultLogger = new Logger('TransactionRetry');

/**
 * Checks whether an error represents a PostgreSQL deadlock (40P01) or serialization failure (40001).
 */
export function isRetryableTransactionError(error: any): boolean {
  if (!error) {
    return false;
  }

  // Check SQLSTATE error code
  const code =
    error.code ??
    error.meta?.code ??
    error.meta?.database_error?.code ??
    error.originalError?.code;

  if (code === '40P01' || code === '40001' || code === 'P2034') {
    return true;
  }

  // Check message text
  const message = error.message;
  if (typeof message === 'string') {
    if (
      message.includes('40P01') ||
      message.includes('40001') ||
      message.includes('deadlock detected') ||
      message.includes('could not serialize access') ||
      message.includes('Transaction failed due to a write conflict')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Wraps a database transaction operation with automatic retry on PostgreSQL deadlock (40P01)
 * and serialization failure (40001) errors.
 *
 * Rules:
 * - Retries ONLY deadlock (40P01) and serialization failure (40001).
 * - Non-retryable errors are rethrown immediately on the first attempt without retry.
 * - Adds a short randomized delay (jitter) between attempts.
 * - Rethrows the error after the final attempt fails.
 * - Guarantees that any callbacks registered via context.onCommit() are executed ONLY
 *   on the successful attempt, preventing phantom domain event emissions on retried failures.
 */
export async function withTransactionRetry<T>(
  fn: (context: TransactionRetryContext) => Promise<T>,
  options: TransactionRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const minDelayMs = options.minDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 100;
  const logger = options.logger ?? defaultLogger;

  let attempt = 1;

  while (attempt <= maxAttempts) {
    const commitCallbacks: Array<() => void | Promise<void>> = [];
    const context: TransactionRetryContext = {
      attempt,
      onCommit: (cb) => {
        commitCallbacks.push(cb);
      },
    };

    try {
      const result = await fn(context);

      // Successfully committed: flush post-commit callbacks
      for (const cb of commitCallbacks) {
        await cb();
      }

      return result;
    } catch (error) {
      const isRetryable = isRetryableTransactionError(error);

      if (!isRetryable || attempt >= maxAttempts) {
        if (isRetryable && attempt >= maxAttempts) {
          logger.error(
            `Transaction failed after reaching maximum retry limit (${maxAttempts} attempts): ${error?.message}`,
          );
        }
        throw error;
      }

      const delayMs =
        Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;

      logger.warn(
        `Transient transaction conflict detected (code=${(error as any)?.code || 'unknown'}, attempt=${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('Transaction retry loop exhausted unexpectedly');
}
