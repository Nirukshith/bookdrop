import { ClockService } from './clock.service';
import { FakeClockService } from './fake-clock.service';
import {
  computePickupDeadline,
  PICKUP_HOLD_DAYS,
} from '../../config/library-rules';

describe('ClockService & Deadlines (Step 4)', () => {
  describe('ClockService', () => {
    it('returns a valid current Date', () => {
      const clock = new ClockService();
      const before = Date.now();
      const now = clock.now();
      const after = Date.now();

      expect(now).toBeInstanceOf(Date);
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
      expect(now.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('FakeClockService', () => {
    it('starts at default or specified time', () => {
      const defaultClock = new FakeClockService();
      expect(defaultClock.now().toISOString()).toBe('2026-10-21T12:00:00.000Z');

      const customClock = new FakeClockService('2026-01-01T00:00:00.000Z');
      expect(customClock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('allows setting explicit time', () => {
      const clock = new FakeClockService();
      clock.setTime('2026-05-15T18:30:00.000Z');
      expect(clock.now().toISOString()).toBe('2026-05-15T18:30:00.000Z');
    });

    it('advances time by milliseconds, hours, and days', () => {
      const clock = new FakeClockService('2026-10-21T12:00:00.000Z');

      clock.advanceMs(500);
      expect(clock.now().toISOString()).toBe('2026-10-21T12:00:00.500Z');

      clock.advanceHours(2);
      expect(clock.now().toISOString()).toBe('2026-10-21T14:00:00.500Z');

      clock.advanceDays(1);
      expect(clock.now().toISOString()).toBe('2026-10-22T14:00:00.500Z');
    });

    it('returns fresh Date copies so mutations do not affect internal state', () => {
      const clock = new FakeClockService('2026-10-21T12:00:00.000Z');
      const d1 = clock.now();
      d1.setFullYear(2030);

      expect(clock.now().getUTCFullYear()).toBe(2026);
    });
  });

  describe('computePickupDeadline', () => {
    it('computes deadline exactly PICKUP_HOLD_DAYS (24h) ahead in UTC', () => {
      const createdAt = new Date('2026-10-21T10:15:30.000Z');
      const deadline = computePickupDeadline(createdAt);

      const expectedMs =
        createdAt.getTime() + PICKUP_HOLD_DAYS * 24 * 60 * 60 * 1000;
      expect(deadline.getTime()).toBe(expectedMs);
      expect(deadline.toISOString()).toBe('2026-10-22T10:15:30.000Z');
    });
  });
});
