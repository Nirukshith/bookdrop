/**
 * Pure Token Bucket Rate Limiter for outbound email pacing:
 * Enforces EMAIL_MAX_PER_SECOND with sub-second token replenishment and async acquisition.
 */
export class TokenBucketRateLimiter {
  private readonly maxPerSecond: number;
  private readonly capacity: number;
  private tokens: number;
  private lastRefillMs: number;
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: {
    maxPerSecond: number;
    capacity?: number;
    clock?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }) {
    if (options.maxPerSecond <= 0) {
      throw new Error(
        `Rate limit must be greater than zero, received: ${options.maxPerSecond}`,
      );
    }
    this.maxPerSecond = options.maxPerSecond;
    this.capacity =
      options.capacity ?? Math.max(1, Math.floor(options.maxPerSecond));
    this.clock = options.clock ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    this.tokens = this.capacity;
    this.lastRefillMs = this.clock();
  }

  /**
   * Refills tokens based on elapsed wall-clock milliseconds.
   */
  private refill(now: number): void {
    const elapsedMs = Math.max(0, now - this.lastRefillMs);
    if (elapsedMs > 0) {
      const addedTokens = (elapsedMs / 1000) * this.maxPerSecond;
      this.tokens = Math.min(this.capacity, this.tokens + addedTokens);
      this.lastRefillMs = now;
    }
  }

  /**
   * Returns current token count after applying fractional refill.
   */
  public getTokens(now: number = this.clock()): number {
    this.refill(now);
    return this.tokens;
  }

  /**
   * Attempts to immediately consume tokens without waiting.
   * Returns true if successful, false if insufficient tokens.
   */
  public tryConsume(tokens = 1, now: number = this.clock()): boolean {
    this.refill(now);
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  /**
   * Asynchronously acquires tokens, pausing execution if necessary until sufficient
   * tokens refill to satisfy the quota.
   */
  public async acquire(tokens = 1): Promise<void> {
    if (tokens > this.capacity) {
      throw new Error(
        `Requested tokens (${tokens}) exceeds maximum bucket capacity (${this.capacity})`,
      );
    }

    while (true) {
      const now = this.clock();
      this.refill(now);

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }

      const neededTokens = tokens - this.tokens;
      const waitMs = Math.max(
        1,
        Math.ceil((neededTokens / this.maxPerSecond) * 1000),
      );
      await this.sleep(waitMs);
    }
  }
}
