export const NOTIFICATION_BATCH_SIZE = 20;
export const NOTIFICATION_LOCK_SECONDS = 120;
export const NOTIFICATION_MAX_ATTEMPTS = 5;
export const NOTIFICATION_JOB_INTERVAL_SECONDS = 30;
export const DEFAULT_LIBRARY_TIMEZONE = 'UTC';
export const PAISE_PER_RUPEE = 100;

export function formatRs(minor: number, prefix: string = ''): string {
  if (!Number.isInteger(minor)) {
    throw new Error(
      `Minor units amount must be an integer, received: ${minor}`,
    );
  }
  const isNegative = minor < 0;
  const absMinor = Math.abs(minor);
  const rupees = Math.floor(absMinor / PAISE_PER_RUPEE);
  const paise = absMinor % PAISE_PER_RUPEE;
  const formatted = `${rupees}.${paise.toString().padStart(2, '0')}`;
  return `${isNegative ? '-' : ''}${prefix}${formatted}`;
}

/**
 * Computes exponential backoff delay in milliseconds.
 * Formula: min(60s * 2^(attempt - 1), 24h)
 */
export function computeBackoffMs(attempt: number): number {
  const baseMs = 60 * 1000; // 1 minute base
  const multiplier = Math.pow(2, Math.max(0, attempt - 1));
  const maxDelayMs = 24 * 60 * 60 * 1000; // 24 hours cap
  return Math.min(baseMs * multiplier, maxDelayMs);
}
