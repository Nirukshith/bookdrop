import { DateTime } from 'luxon';
import {
  computeDueDate,
  computePickupDeadline,
  calculateHoldExpiresAt,
  LOAN_DAYS,
  MAX_ACTIVE_LOANS,
  MAX_ACTIVE_HOLDS,
} from './library-rules';

describe('library-rules', () => {
  describe('constants', () => {
    it('defines expected library rules', () => {
      expect(LOAN_DAYS).toBe(14);
      expect(MAX_ACTIVE_LOANS).toBe(3);
      expect(MAX_ACTIVE_HOLDS).toBe(3);
    });

    it('computes pickup deadline 24 hours later in UTC', () => {
      const now = new Date('2026-10-23T10:00:00.000Z');
      const deadline = computePickupDeadline(now);
      expect(deadline.toISOString()).toBe('2026-10-24T10:00:00.000Z');
      expect(calculateHoldExpiresAt(now).toISOString()).toBe(
        '2026-10-24T10:00:00.000Z',
      );
    });
  });

  describe('computeDueDate', () => {
    describe('Asia/Colombo timezone (fixed UTC+05:30 offset)', () => {
      it('calculates due date at 23:59:59.999 local time 14 calendar days later for midday checkout', () => {
        // Monday, Oct 12, 2026 at 12:00:00 PM local Colombo time (06:30:00.000 UTC)
        const borrowedAt = new Date('2026-10-12T06:30:00.000Z');

        const dueAt = computeDueDate(borrowedAt, 'Asia/Colombo', 14);

        // 14 calendar days later: Monday, Oct 26, 2026 at 23:59:59.999 local (UTC+5:30)
        // 23:59:59.999 - 05:30 = 18:29:59.999 UTC
        expect(dueAt.toISOString()).toBe('2026-10-26T18:29:59.999Z');

        // Verify local representation in Asia/Colombo
        const localDue = DateTime.fromJSDate(dueAt, { zone: 'Asia/Colombo' });
        expect(localDue.year).toBe(2026);
        expect(localDue.month).toBe(10);
        expect(localDue.day).toBe(26);
        expect(localDue.hour).toBe(23);
        expect(localDue.minute).toBe(59);
        expect(localDue.second).toBe(59);
        expect(localDue.millisecond).toBe(999);
      });

      it('correctly handles pickup at 23:59 local time (end of calendar day)', () => {
        // Monday, Oct 12, 2026 at 23:59:00 local Colombo time (18:29:00.000 UTC)
        const borrowedAt = new Date('2026-10-12T18:29:00.000Z');

        const dueAt = computeDueDate(borrowedAt, 'Asia/Colombo', 14);

        // Still checked out on Oct 12 calendar day -> due on Oct 26 at 23:59:59.999 local
        expect(dueAt.toISOString()).toBe('2026-10-26T18:29:59.999Z');

        const localDue = DateTime.fromJSDate(dueAt, { zone: 'Asia/Colombo' });
        expect(localDue.day).toBe(26);
        expect(localDue.hour).toBe(23);
        expect(localDue.minute).toBe(59);
      });

      it('correctly handles pickup just after midnight (start of next calendar day)', () => {
        // Tuesday, Oct 13, 2026 at 00:01:00 local Colombo time (18:31:00.000 UTC on Oct 12)
        const borrowedAt = new Date('2026-10-12T18:31:00.000Z');

        const dueAt = computeDueDate(borrowedAt, 'Asia/Colombo', 14);

        // Checked out on Oct 13 calendar day -> due on Tuesday, Oct 27 at 23:59:59.999 local
        // 23:59:59.999 - 05:30 = 18:29:59.999 UTC on Oct 27
        expect(dueAt.toISOString()).toBe('2026-10-27T18:29:59.999Z');

        const localDue = DateTime.fromJSDate(dueAt, { zone: 'Asia/Colombo' });
        expect(localDue.day).toBe(27);
        expect(localDue.hour).toBe(23);
        expect(localDue.minute).toBe(59);
      });
    });

    describe('America/New_York daylight saving time transitions (proves calendar days, not 24h blocks)', () => {
      it('adds calendar days across Fall DST change (EDT -> EST, 25-hour transition day)', () => {
        // In 2026, US DST ends on Sunday, Nov 1, 2026 at 2:00 AM (clocks turn back 1h from UTC-4 to UTC-5).
        // Checkout: Monday, Oct 26, 2026 at 14:00 EDT (18:00:00.000 UTC)
        const borrowedAt = new Date('2026-10-26T18:00:00.000Z');

        const dueAt = computeDueDate(borrowedAt, 'America/New_York', 14);

        // 14 calendar days later: Monday, Nov 9, 2026
        // On Nov 9, NY is in EST (UTC-5)
        // Local end of day: 2026-11-09 23:59:59.999 -05:00 -> 2026-11-10T04:59:59.999Z
        expect(dueAt.toISOString()).toBe('2026-11-10T04:59:59.999Z');

        const localDue = DateTime.fromJSDate(dueAt, {
          zone: 'America/New_York',
        });
        expect(localDue.year).toBe(2026);
        expect(localDue.month).toBe(11);
        expect(localDue.day).toBe(9);
        expect(localDue.hour).toBe(23);
        expect(localDue.minute).toBe(59);
        expect(localDue.second).toBe(59);
        expect(localDue.millisecond).toBe(999);
        expect(localDue.offsetNameShort).toBe('EST');

        // If naive 14 * 24 = 336 hours were added from Oct 26 23:59:59.999 EDT (Oct 27 03:59:59.999 UTC),
        // it would land at 03:59:59.999 UTC Nov 10, which is 22:59:59.999 EST (1 hour early!).
        // Calendar day arithmetic ensures the member gets the full day until 23:59:59.999.
        const naive336hInUtc = new Date(
          new Date('2026-10-27T03:59:59.999Z').getTime() +
            14 * 24 * 60 * 60 * 1000,
        );
        expect(dueAt.getTime()).not.toBe(naive336hInUtc.getTime());
        expect(dueAt.getTime() - naive336hInUtc.getTime()).toBe(3600000); // exactly 1 hour difference
      });

      it('adds calendar days across Spring DST change (EST -> EDT, 23-hour transition day)', () => {
        // In 2026, US DST begins on Sunday, Mar 8, 2026 at 2:00 AM (clocks spring forward 1h from UTC-5 to UTC-4).
        // Checkout: Monday, Mar 2, 2026 at 10:00 EST (15:00:00.000 UTC)
        const borrowedAt = new Date('2026-03-02T15:00:00.000Z');

        const dueAt = computeDueDate(borrowedAt, 'America/New_York', 14);

        // 14 calendar days later: Monday, Mar 16, 2026
        // On Mar 16, NY is in EDT (UTC-4)
        // Local end of day: 2026-03-16 23:59:59.999 -04:00 -> 2026-03-17T03:59:59.999Z
        expect(dueAt.toISOString()).toBe('2026-03-17T03:59:59.999Z');

        const localDue = DateTime.fromJSDate(dueAt, {
          zone: 'America/New_York',
        });
        expect(localDue.year).toBe(2026);
        expect(localDue.month).toBe(3);
        expect(localDue.day).toBe(16);
        expect(localDue.hour).toBe(23);
        expect(localDue.minute).toBe(59);
        expect(localDue.second).toBe(59);
        expect(localDue.millisecond).toBe(999);
        expect(localDue.offsetNameShort).toBe('EDT');
      });
    });

    describe('defaults and validation', () => {
      it('defaults to UTC and 14 days when timezone and days are omitted', () => {
        const borrowedAt = new Date('2026-10-10T08:00:00.000Z');
        const dueAt = computeDueDate(borrowedAt);

        // In UTC: 14 days from Oct 10 is Oct 24 at 23:59:59.999Z
        expect(dueAt.toISOString()).toBe('2026-10-24T23:59:59.999Z');
      });

      it('throws an error when an invalid IANA timezone name is provided', () => {
        const borrowedAt = new Date('2026-10-10T08:00:00.000Z');
        expect(() => computeDueDate(borrowedAt, 'Mars/Olympus_Mons')).toThrow(
          /Invalid timezone or date provided to computeDueDate/,
        );
      });
    });
  });
});
