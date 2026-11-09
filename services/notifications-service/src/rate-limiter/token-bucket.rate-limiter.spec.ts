import { TokenBucketRateLimiter } from './token-bucket.rate-limiter';

describe('TokenBucketRateLimiter (Unit Tests with Deterministic Clock)', () => {
  let currentTime: number;
  let fakeClock: () => number;
  let fakeSleep: (ms: number) => Promise<void>;
  let sleptTotalMs: number;

  beforeEach(() => {
    currentTime = 10000;
    sleptTotalMs = 0;
    fakeClock = () => currentTime;
    fakeSleep = async (ms: number) => {
      sleptTotalMs += ms;
      currentTime += ms;
    };
  });

  it('initializes with capacity tokens', () => {
    const limiter = new TokenBucketRateLimiter({
      maxPerSecond: 2,
      capacity: 2,
      clock: fakeClock,
      sleep: fakeSleep,
    });

    expect(limiter.getTokens()).toBe(2);
  });

  it('immediately consumes available tokens with tryConsume', () => {
    const limiter = new TokenBucketRateLimiter({
      maxPerSecond: 1,
      capacity: 1,
      clock: fakeClock,
      sleep: fakeSleep,
    });

    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.getTokens()).toBe(0);
    expect(limiter.tryConsume(1)).toBe(false);
  });

  it('replenishes tokens over elapsed time', () => {
    const limiter = new TokenBucketRateLimiter({
      maxPerSecond: 2, // 2 tokens per 1000ms = 1 token per 500ms
      capacity: 2,
      clock: fakeClock,
      sleep: fakeSleep,
    });

    // Consume all 2 tokens
    expect(limiter.tryConsume(2)).toBe(true);
    expect(limiter.getTokens()).toBe(0);

    // Advance 500ms -> should refill 1 token
    currentTime += 500;
    expect(limiter.getTokens()).toBe(1);

    // Advance another 500ms -> should refill to capacity of 2 tokens
    currentTime += 500;
    expect(limiter.getTokens()).toBe(2);

    // Advance another 1000ms -> should not exceed capacity of 2
    currentTime += 1000;
    expect(limiter.getTokens()).toBe(2);
  });

  it('asynchronously pauses when acquiring tokens until replenishment', async () => {
    const limiter = new TokenBucketRateLimiter({
      maxPerSecond: 1, // 1 token per second
      capacity: 1,
      clock: fakeClock,
      sleep: fakeSleep,
    });

    // 1st email: consumes immediate token
    await limiter.acquire(1);
    expect(sleptTotalMs).toBe(0);

    // 2nd email: bucket is empty, must sleep 1000ms
    await limiter.acquire(1);
    expect(sleptTotalMs).toBe(1000);

    // 3rd email: bucket empty again, sleeps another 1000ms
    await limiter.acquire(1);
    expect(sleptTotalMs).toBe(2000);
  });

  it('rejects invalid constructor parameters', () => {
    expect(
      () =>
        new TokenBucketRateLimiter({
          maxPerSecond: 0,
          clock: fakeClock,
        }),
    ).toThrow(/Rate limit must be greater than zero/);
  });

  it('rejects acquiring tokens greater than capacity', async () => {
    const limiter = new TokenBucketRateLimiter({
      maxPerSecond: 1,
      capacity: 2,
      clock: fakeClock,
      sleep: fakeSleep,
    });

    await expect(limiter.acquire(3)).rejects.toThrow(
      /exceeds maximum bucket capacity/,
    );
  });
});
