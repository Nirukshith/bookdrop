import {
  withTransactionRetry,
  isRetryableTransactionError,
} from './transaction-retry';

describe('withTransactionRetry (Unit Tests)', () => {
  describe('isRetryableTransactionError', () => {
    it('returns true for SQLSTATE 40P01 (deadlock detected)', () => {
      expect(isRetryableTransactionError({ code: '40P01' })).toBe(true);
      expect(isRetryableTransactionError({ meta: { code: '40P01' } })).toBe(
        true,
      );
      expect(
        isRetryableTransactionError({
          message: 'deadlock detected while executing query',
        }),
      ).toBe(true);
    });

    it('returns true for SQLSTATE 40001 (serialization failure)', () => {
      expect(isRetryableTransactionError({ code: '40001' })).toBe(true);
      expect(isRetryableTransactionError({ meta: { code: '40001' } })).toBe(
        true,
      );
      expect(
        isRetryableTransactionError({
          message: 'could not serialize access due to concurrent update',
        }),
      ).toBe(true);
    });

    it('returns true for Prisma P2034 (transaction write conflict)', () => {
      expect(isRetryableTransactionError({ code: 'P2034' })).toBe(true);
    });

    it('returns false for generic errors, syntax errors, and non-retryable exceptions', () => {
      expect(isRetryableTransactionError(null)).toBe(false);
      expect(isRetryableTransactionError(undefined)).toBe(false);
      expect(isRetryableTransactionError(new Error('Syntax error'))).toBe(
        false,
      );
      expect(isRetryableTransactionError({ code: 'P2002' })).toBe(false); // unique violation
      expect(isRetryableTransactionError({ code: 'P2025' })).toBe(false); // record not found
      expect(isRetryableTransactionError({ code: '23505' })).toBe(false); // unique violation sqlstate
    });
  });

  describe('retry execution behavior', () => {
    it('executes once and returns result on immediate success', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await withTransactionRetry(fn);

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on SQLSTATE 40P01 deadlock and succeeds on second attempt', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('deadlock detected');
          err.code = '40P01';
          throw err;
        }
        return 'success-after-deadlock';
      });

      const result = await withTransactionRetry(fn, {
        minDelayMs: 1,
        maxDelayMs: 2,
      });

      expect(result).toBe('success-after-deadlock');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries on SQLSTATE 40001 serialization failure and succeeds on third attempt', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          const err: any = new Error('could not serialize access');
          err.code = '40001';
          throw err;
        }
        return 'success-after-serialization-failure';
      });

      const result = await withTransactionRetry(fn, {
        maxAttempts: 4,
        minDelayMs: 1,
        maxDelayMs: 2,
      });

      expect(result).toBe('success-after-serialization-failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does NOT retry non-retryable errors and throws immediately on attempt 1', async () => {
      const fn = jest.fn().mockImplementation(async () => {
        throw new Error('User not found');
      });

      await expect(
        withTransactionRetry(fn, { minDelayMs: 1, maxDelayMs: 2 }),
      ).rejects.toThrow('User not found');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('rethrows error when maxAttempts are exhausted', async () => {
      const deadlockError: any = new Error('persistent deadlock');
      deadlockError.code = '40P01';

      const fn = jest.fn().mockRejectedValue(deadlockError);

      await expect(
        withTransactionRetry(fn, {
          maxAttempts: 3,
          minDelayMs: 1,
          maxDelayMs: 2,
        }),
      ).rejects.toThrow('persistent deadlock');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('guarantees onCommit callbacks are NOT called for failed attempts and run once on success', async () => {
      const committedEvents: string[] = [];
      let callCount = 0;

      const fn = jest.fn().mockImplementation(async (ctx) => {
        callCount++;
        ctx.onCommit(() => {
          committedEvents.push(`event-from-attempt-${callCount}`);
        });

        if (callCount < 2) {
          const err: any = new Error('deadlock');
          err.code = '40P01';
          throw err;
        }

        return 'done';
      });

      const result = await withTransactionRetry(fn, {
        minDelayMs: 1,
        maxDelayMs: 2,
      });

      expect(result).toBe('done');
      expect(fn).toHaveBeenCalledTimes(2);

      // Crucial invariant: Only event from attempt 2 ran, attempt 1 was discarded!
      expect(committedEvents).toEqual(['event-from-attempt-2']);
    });

    it('does NOT run onCommit callbacks if all attempts fail and error is rethrown', async () => {
      const committedEvents: string[] = [];
      const deadlockError: any = new Error('persistent deadlock');
      deadlockError.code = '40P01';

      const fn = jest.fn().mockImplementation(async (ctx) => {
        ctx.onCommit(() => {
          committedEvents.push('should-never-run');
        });
        throw deadlockError;
      });

      await expect(
        withTransactionRetry(fn, {
          maxAttempts: 2,
          minDelayMs: 1,
          maxDelayMs: 2,
        }),
      ).rejects.toThrow('persistent deadlock');

      expect(committedEvents).toHaveLength(0);
    });
  });
});
