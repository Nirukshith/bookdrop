import { DateTime } from 'luxon';
import {
  computeDueDate,
  computePickupDeadline,
  calculateHoldExpiresAt,
  computeDaysLate,
  computeLateFeeMinor,
  resolveLateFeeCapMinor,
  calculateLateFee,
  rsToMinor,
  formatRs,
  validateAssessedFineRs,
  validateFineAmountMinor,
  selectMissedPickupsToAssess,
  isExcusedAsSystemDelay,
  selectReminderWindows,
  isLoanDueSoon,
  isLoanOverdue,
  isHoldExpiringSoon,
  isLeaseActive,
  computeLeaseExpiry,
  LOAN_DAYS,
  MAX_ACTIVE_LOANS,
  MAX_ACTIVE_HOLDS,
  LATE_FEE_PER_DAY_RS,
  LATE_FEE_CAP_RS,
  MAX_ASSESSED_FINE_RS,
  MAX_ASSESSED_FINE_MINOR,
  PAISE_PER_RUPEE,
  MISSED_PICKUPS_BEFORE_FINE,
  MISSED_PICKUP_FINE_RS,
  MISSED_PICKUP_GRACE_MINUTES,
  DUE_SOON_HOURS,
  HOLD_REMINDER_HOURS,
  JOB_BATCH_SIZE,
  JOB_MAX_RUN_SECONDS,
  LEASE_SECONDS,
  EXPIRE_HOLDS_INTERVAL_SECONDS,
  REMINDERS_INTERVAL_SECONDS,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_BATCH_SIZE,
  NOTIFICATION_LOCK_SECONDS,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_JOB_INTERVAL_SECONDS,
  NOTIFICATION_BASE_BACKOFF_MS,
  NOTIFICATION_MAX_BACKOFF_MS,
  computeBackoffMs,
} from './library-rules';

describe('library-rules', () => {
  describe('constants', () => {
    it('defines expected library rules', () => {
      expect(LOAN_DAYS).toBe(14);
      expect(MAX_ACTIVE_LOANS).toBe(3);
      expect(MAX_ACTIVE_HOLDS).toBe(3);
      expect(LATE_FEE_PER_DAY_RS).toBe(10);
      expect(LATE_FEE_CAP_RS).toBeNull();
      expect(MAX_ASSESSED_FINE_RS).toBe(100000);
      expect(PAISE_PER_RUPEE).toBe(100);
      expect(MAX_ASSESSED_FINE_MINOR).toBe(10000000);
      expect(MISSED_PICKUPS_BEFORE_FINE).toBe(3);
      expect(MISSED_PICKUP_FINE_RS).toBe(100);
      expect(MISSED_PICKUP_GRACE_MINUTES).toBe(60);
      expect(DUE_SOON_HOURS).toBe(48);
      expect(HOLD_REMINDER_HOURS).toBe(6);
      expect(JOB_BATCH_SIZE).toBe(100);
      expect(JOB_MAX_RUN_SECONDS).toBe(50);
      expect(LEASE_SECONDS).toBe(120);
      expect(EXPIRE_HOLDS_INTERVAL_SECONDS).toBe(60);
      expect(REMINDERS_INTERVAL_SECONDS).toBe(900);
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

  describe('computeDaysLate', () => {
    describe('Asia/Colombo timezone (fixed UTC+05:30 offset)', () => {
      // Due: Monday, Oct 26, 2026 at 23:59:59.999 local (18:29:59.999 UTC)
      const dueAtColombo = new Date('2026-10-26T18:29:59.999Z');

      it('returns 0 days late when returned at 23:59 local on the due day', () => {
        // Monday, Oct 26, 2026 at 23:59:00.000 local (18:29:00.000 UTC)
        const returnedAt = new Date('2026-10-26T18:29:00.000Z');
        expect(computeDaysLate(dueAtColombo, returnedAt, 'Asia/Colombo')).toBe(
          0,
        );
      });

      it('returns 0 days late when returned at 23:59:59.999 local on the due day', () => {
        const returnedAt = new Date('2026-10-26T18:29:59.999Z');
        expect(computeDaysLate(dueAtColombo, returnedAt, 'Asia/Colombo')).toBe(
          0,
        );
      });

      it('returns 1 day late when returned at 00:00:00 on the next local day', () => {
        // Tuesday, Oct 27, 2026 at 00:00:00.000 local (18:30:00.000 UTC on Oct 26)
        const returnedAt = new Date('2026-10-26T18:30:00.000Z');
        expect(computeDaysLate(dueAtColombo, returnedAt, 'Asia/Colombo')).toBe(
          1,
        );
      });

      it('returns 1 day late when returned at 00:00:01 on the next local day', () => {
        // Tuesday, Oct 27, 2026 at 00:00:01.000 local (18:30:01.000 UTC on Oct 26)
        const returnedAt = new Date('2026-10-26T18:30:01.000Z');
        expect(computeDaysLate(dueAtColombo, returnedAt, 'Asia/Colombo')).toBe(
          1,
        );
      });

      it('returns 0 days late when returned long before the due date', () => {
        // Returned 10 days before due date: Oct 16, 2026 at 10:00:00 local (04:30:00 UTC)
        const returnedAt = new Date('2026-10-16T04:30:00.000Z');
        expect(computeDaysLate(dueAtColombo, returnedAt, 'Asia/Colombo')).toBe(
          0,
        );
      });

      it('returns exact days late when returned several days late', () => {
        // Returned on Thursday, Oct 29, 2026 at 15:00:00 local (09:30:00 UTC) -> 3 days late
        const returnedAt = new Date('2026-10-29T09:30:00.000Z');
        expect(computeDaysLate(dueAtColombo, returnedAt, 'Asia/Colombo')).toBe(
          3,
        );
      });
    });

    describe('America/New_York across DST changes', () => {
      it('calculates calendar days late across Fall DST change (EDT -> EST, 25-hour day)', () => {
        // In 2026, US DST ends on Sunday, Nov 1, 2026 (clocks turn back 1h at 2:00 AM)
        // Due on Sunday, Nov 1, 2026 at 23:59:59.999 local (Nov 2, 2026 at 03:59:59.999 UTC)
        const dueAt = new Date('2026-11-02T03:59:59.999Z');

        // Returned Nov 1 at 23:59:00 EDT (Nov 2 at 03:59:00 UTC) -> 0 days late
        const returnedOnDueDay = new Date('2026-11-02T03:59:00.000Z');
        expect(
          computeDaysLate(dueAt, returnedOnDueDay, 'America/New_York'),
        ).toBe(0);

        // Returned Nov 2 at 00:00:01 EST (Nov 2 at 05:00:01 UTC) -> 1 day late
        const returnedNextDay = new Date('2026-11-02T05:00:01.000Z');
        expect(
          computeDaysLate(dueAt, returnedNextDay, 'America/New_York'),
        ).toBe(1);

        // Returned Nov 5 at 12:00 EST (Nov 5 at 17:00 UTC) -> 4 days late
        const returned4DaysLate = new Date('2026-11-05T17:00:00.000Z');
        expect(
          computeDaysLate(dueAt, returned4DaysLate, 'America/New_York'),
        ).toBe(4);
      });

      it('calculates calendar days late across Spring DST change (EST -> EDT, 23-hour day)', () => {
        // In 2026, US DST begins Sunday, Mar 8, 2026 (clocks spring forward 1h at 2:00 AM)
        // Due on Saturday, Mar 7, 2026 at 23:59:59.999 local EST (Mar 8 at 04:59:59.999 UTC)
        const dueAt = new Date('2026-03-08T04:59:59.999Z');

        // Returned on Mar 7 at 23:00 EST -> 0 days late
        const returnedOnDueDay = new Date('2026-03-08T04:00:00.000Z');
        expect(
          computeDaysLate(dueAt, returnedOnDueDay, 'America/New_York'),
        ).toBe(0);

        // Returned on Monday, Mar 9 at 08:00 EDT (after the 23-hour transition day) -> 2 days late
        // (Mar 8 = 1 day late, Mar 9 = 2 days late)
        const returnedMar9 = new Date('2026-03-09T12:00:00.000Z');
        expect(computeDaysLate(dueAt, returnedMar9, 'America/New_York')).toBe(
          2,
        );
      });
    });

    describe('validation', () => {
      it('throws when invalid timezone is passed', () => {
        const now = new Date();
        expect(() => computeDaysLate(now, now, 'Invalid/Timezone')).toThrow(
          /Invalid timezone or date provided to computeDaysLate/,
        );
      });
    });
  });

  describe('computeLateFeeMinor', () => {
    it('returns 0 when days late is 0 or negative', () => {
      expect(computeLateFeeMinor(0)).toBe(0);
      expect(computeLateFeeMinor(-1)).toBe(0);
      expect(computeLateFeeMinor(-10)).toBe(0);
    });

    it('calculates fee when cap is not set (capRs is null)', () => {
      // Default rate: 10 Rs / day = 1000 minor / day
      expect(computeLateFeeMinor(1, 10, null)).toBe(1000);
      expect(computeLateFeeMinor(3, 10, null)).toBe(3000);
      expect(computeLateFeeMinor(10, 10, null)).toBe(10000);
    });

    it('caps the fee when uncapped fee exceeds capRs', () => {
      // 10 days late * 10 Rs = 100 Rs = 10000 minor. Cap = 50 Rs (5000 minor).
      expect(computeLateFeeMinor(10, 10, 50)).toBe(5000);
    });

    it('does not cap the fee when uncapped fee is lower than capRs', () => {
      // 2 days late * 10 Rs = 20 Rs = 2000 minor. Cap = 50 Rs (5000 minor).
      expect(computeLateFeeMinor(2, 10, 50)).toBe(2000);
    });

    it('returns exact cap when uncapped fee equals capRs', () => {
      // 5 days late * 10 Rs = 50 Rs = 5000 minor. Cap = 50 Rs.
      expect(computeLateFeeMinor(5, 10, 50)).toBe(5000);
    });

    it('supports custom daily rate', () => {
      // 3 days * 25 Rs = 75 Rs = 7500 minor.
      expect(computeLateFeeMinor(3, 25, null)).toBe(7500);
    });

    it('throws when daysLate is a non-integer', () => {
      expect(() => computeLateFeeMinor(2.5, 10, null)).toThrow(
        /daysLate must be an integer/,
      );
    });

    it('throws when ratePerDayRs is non-positive or non-integer', () => {
      expect(() => computeLateFeeMinor(2, 0, null)).toThrow(
        /ratePerDayRs must be a positive integer/,
      );
      expect(() => computeLateFeeMinor(2, -5, null)).toThrow(
        /ratePerDayRs must be a positive integer/,
      );
      expect(() => computeLateFeeMinor(2, 5.5, null)).toThrow(
        /ratePerDayRs must be a positive integer/,
      );
    });

    it('throws when capRs is negative or non-integer', () => {
      expect(() => computeLateFeeMinor(2, 10, -10)).toThrow(
        /capRs must be a non-negative integer or null/,
      );
      expect(() => computeLateFeeMinor(2, 10, 15.5)).toThrow(
        /capRs must be a non-negative integer or null/,
      );
    });
  });

  describe('resolveLateFeeCapMinor', () => {
    it('resolves Tier 1: snapshot on loan takes priority over book current price and global cap', () => {
      const cap = resolveLateFeeCapMinor({
        loanSnapshotMinor: 45000,
        bookCurrentPriceMinor: 60000,
        globalCapRs: 100,
      });
      expect(cap).toBe(45000);
    });

    it('resolves Tier 2: book current price when loan has no snapshot', () => {
      const cap = resolveLateFeeCapMinor({
        loanSnapshotMinor: null,
        bookCurrentPriceMinor: 60000,
        globalCapRs: 100,
      });
      expect(cap).toBe(60000);
    });

    it('resolves Tier 3: global cap converted to minor units when book has no price', () => {
      const cap = resolveLateFeeCapMinor({
        loanSnapshotMinor: null,
        bookCurrentPriceMinor: null,
        globalCapRs: 50,
      });
      expect(cap).toBe(5000); // 50 * 100 paise
    });

    it('resolves Tier 4: null (uncapped) when neither loan snapshot, book price, nor global cap exists', () => {
      const cap = resolveLateFeeCapMinor({
        loanSnapshotMinor: null,
        bookCurrentPriceMinor: null,
        globalCapRs: null,
      });
      expect(cap).toBeNull();
    });
  });

  describe('calculateLateFee', () => {
    it('returns 0 for daysLate <= 0', () => {
      expect(calculateLateFee({ daysLate: 0, capMinor: 5000 })).toEqual({
        uncappedAmountMinor: 0,
        amountMinor: 0,
        capMinor: 5000,
        wasCapped: false,
      });
      expect(calculateLateFee({ daysLate: -3 })).toEqual({
        uncappedAmountMinor: 0,
        amountMinor: 0,
        capMinor: null,
        wasCapped: false,
      });
    });

    it('calculates uncapped late fee when capMinor is null', () => {
      // 3 days * Rs 10 = Rs 30 = 3000 minor
      const result = calculateLateFee({ daysLate: 3, capMinor: null });
      expect(result).toEqual({
        uncappedAmountMinor: 3000,
        amountMinor: 3000,
        capMinor: null,
        wasCapped: false,
      });
    });

    it('caps late fee and sets wasCapped to true when uncapped fee exceeds capMinor', () => {
      // 10 days * Rs 10 = Rs 100 = 10000 minor; capped at 4000 minor (Rs 40)
      const result = calculateLateFee({ daysLate: 10, capMinor: 4000 });
      expect(result).toEqual({
        uncappedAmountMinor: 10000,
        amountMinor: 4000,
        capMinor: 4000,
        wasCapped: true,
      });
    });

    it('does not cap late fee and sets wasCapped to false when uncapped fee is below capMinor', () => {
      // 2 days * Rs 10 = 2000 minor; cap = 5000 minor
      const result = calculateLateFee({ daysLate: 2, capMinor: 5000 });
      expect(result).toEqual({
        uncappedAmountMinor: 2000,
        amountMinor: 2000,
        capMinor: 5000,
        wasCapped: false,
      });
    });

    it('sets wasCapped to false when uncapped fee exactly equals capMinor', () => {
      // 5 days * Rs 10 = 5000 minor; cap = 5000 minor
      const result = calculateLateFee({ daysLate: 5, capMinor: 5000 });
      expect(result).toEqual({
        uncappedAmountMinor: 5000,
        amountMinor: 5000,
        capMinor: 5000,
        wasCapped: false,
      });
    });

    it('validates non-negative integer capMinor', () => {
      expect(() => calculateLateFee({ daysLate: 2, capMinor: -100 })).toThrow(
        /capMinor must be a non-negative integer or null/,
      );
      expect(() => calculateLateFee({ daysLate: 2, capMinor: 10.5 })).toThrow(
        /capMinor must be a non-negative integer or null/,
      );
    });
  });

  describe('Money helpers & validators', () => {
    describe('rsToMinor', () => {
      it('converts integer Rupees to minor units (paise)', () => {
        expect(rsToMinor(0)).toBe(0);
        expect(rsToMinor(1)).toBe(100);
        expect(rsToMinor(10)).toBe(1000);
        expect(rsToMinor(500)).toBe(50000);
      });

      it('throws when Rupee amount is not an integer', () => {
        expect(() => rsToMinor(10.5)).toThrow(
          /Rupee amount must be an integer/,
        );
        expect(() => rsToMinor(NaN)).toThrow(/Rupee amount must be an integer/);
      });
    });

    describe('formatRs', () => {
      it('formats minor units to standard decimal Rupee strings', () => {
        expect(formatRs(0)).toBe('0.00');
        expect(formatRs(5)).toBe('0.05');
        expect(formatRs(50)).toBe('0.50');
        expect(formatRs(100)).toBe('1.00');
        expect(formatRs(1050)).toBe('10.50');
        expect(formatRs(50000)).toBe('500.00');
      });

      it('supports custom currency prefixes', () => {
        expect(formatRs(1000, '₹')).toBe('₹10.00');
        expect(formatRs(1000, 'Rs ')).toBe('Rs 10.00');
      });

      it('handles negative minor amounts gracefully', () => {
        expect(formatRs(-1050)).toBe('-10.50');
        expect(formatRs(-1050, '₹')).toBe('-₹10.50');
      });

      it('throws when minor amount is not an integer', () => {
        expect(() => formatRs(10.5)).toThrow(
          /Minor units amount must be an integer/,
        );
      });
    });

    describe('validateAssessedFineRs', () => {
      it('accepts valid positive integer Rupee amounts within limit', () => {
        expect(() => validateAssessedFineRs(1)).not.toThrow();
        expect(() => validateAssessedFineRs(500)).not.toThrow();
        expect(() => validateAssessedFineRs(100000)).not.toThrow();
      });

      it('rejects zero, negative amounts, non-integers, and amounts above maximum', () => {
        expect(() => validateAssessedFineRs(0)).toThrow(
          /must be greater than zero/,
        );
        expect(() => validateAssessedFineRs(-10)).toThrow(
          /must be greater than zero/,
        );
        expect(() => validateAssessedFineRs(15.75)).toThrow(
          /must be an integer/,
        );
        expect(() => validateAssessedFineRs(100001)).toThrow(
          /exceeds the maximum allowed fine/,
        );
      });
    });

    describe('validateFineAmountMinor', () => {
      it('accepts valid positive integer minor amounts within limit', () => {
        expect(() => validateFineAmountMinor(100)).not.toThrow();
        expect(() => validateFineAmountMinor(50000)).not.toThrow();
        expect(() => validateFineAmountMinor(10000000)).not.toThrow();
      });

      it('rejects zero, negative amounts, non-integers, and amounts above maximum', () => {
        expect(() => validateFineAmountMinor(0)).toThrow(
          /must be greater than zero/,
        );
        expect(() => validateFineAmountMinor(-100)).toThrow(
          /must be greater than zero/,
        );
        expect(() => validateFineAmountMinor(100.5)).toThrow(
          /must be an integer/,
        );
        expect(() => validateFineAmountMinor(10000001)).toThrow(
          /exceeds the maximum allowed fine/,
        );
      });
    });
  });

  describe('selectMissedPickupsToAssess', () => {
    it('returns empty groups and empty remainder for 0 items', () => {
      const result = selectMissedPickupsToAssess([], 3);
      expect(result.groups).toEqual([]);
      expect(result.toAssess).toEqual([]);
      expect(result.remainder).toEqual([]);
    });

    it('returns empty groups and all items as remainder for 2 items (below threshold 3)', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const result = selectMissedPickupsToAssess(items, 3);
      expect(result.groups).toEqual([]);
      expect(result.toAssess).toEqual([]);
      expect(result.remainder).toEqual(items);
    });

    it('returns 1 group of 3 and empty remainder for 3 items (exact threshold)', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = selectMissedPickupsToAssess(items, 3);
      expect(result.groups).toEqual([items]);
      expect(result.toAssess).toEqual([items]);
      expect(result.remainder).toEqual([]);
    });

    it('returns 1 group of 3 and 1 remainder for 4 items', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
      const result = selectMissedPickupsToAssess(items, 3);
      expect(result.groups).toEqual([[items[0], items[1], items[2]]]);
      expect(result.toAssess).toEqual([[items[0], items[1], items[2]]]);
      expect(result.remainder).toEqual([items[3]]);
    });

    it('returns 2 groups of 3 and empty remainder for 6 items (two full batches)', () => {
      const items = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
        { id: 6 },
      ];
      const result = selectMissedPickupsToAssess(items, 3);
      expect(result.groups).toEqual([
        [items[0], items[1], items[2]],
        [items[3], items[4], items[5]],
      ]);
      expect(result.remainder).toEqual([]);
    });

    it('returns 2 groups of 3 and 1 remainder for 7 items', () => {
      const items = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
        { id: 6 },
        { id: 7 },
      ];
      const result = selectMissedPickupsToAssess(items, 3);
      expect(result.groups).toEqual([
        [items[0], items[1], items[2]],
        [items[3], items[4], items[5]],
      ]);
      expect(result.remainder).toEqual([items[6]]);
    });

    it('preserves oldest-first order within groups and across batches', () => {
      const ids = [10, 20, 30, 40, 50, 60, 70];
      const result = selectMissedPickupsToAssess(ids, 3);
      expect(result.groups[0]).toEqual([10, 20, 30]);
      expect(result.groups[1]).toEqual([40, 50, 60]);
      expect(result.remainder).toEqual([70]);
    });

    it('defaults threshold to MISSED_PICKUPS_BEFORE_FINE (3)', () => {
      const ids = [1, 2, 3];
      const result = selectMissedPickupsToAssess(ids);
      expect(result.groups).toHaveLength(1);
      expect(result.remainder).toHaveLength(0);
    });

    it('throws error if threshold is <= 0 or not an integer', () => {
      expect(() => selectMissedPickupsToAssess([1], 0)).toThrow(
        /threshold must be a positive integer/,
      );
      expect(() => selectMissedPickupsToAssess([1], -1)).toThrow(
        /threshold must be a positive integer/,
      );
      expect(() => selectMissedPickupsToAssess([1], 2.5)).toThrow(
        /threshold must be a positive integer/,
      );
    });
  });

  describe('isExcusedAsSystemDelay', () => {
    const expiresAt = new Date('2026-11-06T10:00:00.000Z');

    it('returns false when processed before or exactly at expiresAt', () => {
      const earlier = new Date('2026-11-06T09:50:00.000Z');
      expect(isExcusedAsSystemDelay(expiresAt, earlier)).toBe(false);
      expect(isExcusedAsSystemDelay(expiresAt, expiresAt)).toBe(false);
    });

    it('returns false when delay is within the 60-minute grace window', () => {
      const processed30mLater = new Date('2026-11-06T10:30:00.000Z');
      const processed59mLater = new Date('2026-11-06T10:59:00.000Z');
      expect(isExcusedAsSystemDelay(expiresAt, processed30mLater)).toBe(false);
      expect(isExcusedAsSystemDelay(expiresAt, processed59mLater)).toBe(false);
    });

    it('returns false at the exact grace window boundary (delay == 60 minutes)', () => {
      const processedExactly60mLater = new Date('2026-11-06T11:00:00.000Z');
      expect(isExcusedAsSystemDelay(expiresAt, processedExactly60mLater)).toBe(
        false,
      );
    });

    it('returns true when delay strictly exceeds grace window by even 1 millisecond', () => {
      const processed60mPlus1ms = new Date('2026-11-06T11:00:00.001Z');
      expect(isExcusedAsSystemDelay(expiresAt, processed60mPlus1ms)).toBe(true);
    });

    it('returns true when processed much later (e.g. 90 minutes or several days)', () => {
      const processed90mLater = new Date('2026-11-06T11:30:00.000Z');
      const processed3DaysLater = new Date('2026-11-09T10:00:00.000Z');
      expect(isExcusedAsSystemDelay(expiresAt, processed90mLater)).toBe(true);
      expect(isExcusedAsSystemDelay(expiresAt, processed3DaysLater)).toBe(true);
    });

    it('respects custom grace minutes parameter', () => {
      // 15 min custom grace
      const processed20mLater = new Date('2026-11-06T10:20:00.000Z');
      expect(isExcusedAsSystemDelay(expiresAt, processed20mLater, 15)).toBe(
        true,
      );
      expect(isExcusedAsSystemDelay(expiresAt, processed20mLater, 30)).toBe(
        false,
      );
    });

    it('throws error if invalid dates are passed', () => {
      expect(() =>
        isExcusedAsSystemDelay(new Date('invalid'), new Date()),
      ).toThrow(/Invalid Date/);
      expect(() =>
        isExcusedAsSystemDelay(new Date(), new Date('invalid')),
      ).toThrow(/Invalid Date/);
    });
  });

  describe('selectReminderWindows & reminder boundary helpers', () => {
    const baseNow = new Date('2026-11-06T12:00:00.000Z');

    describe('selectReminderWindows', () => {
      it('returns query windows relative to now using default rule constants', () => {
        const windows = selectReminderWindows(baseNow);

        expect(windows.dueSoon.from.toISOString()).toBe(
          '2026-11-06T12:00:00.000Z',
        );
        // now + 48 hours = 2026-11-08T12:00:00.000Z
        expect(windows.dueSoon.to.toISOString()).toBe(
          '2026-11-08T12:00:00.000Z',
        );

        expect(windows.overdue.before.toISOString()).toBe(
          '2026-11-06T12:00:00.000Z',
        );

        expect(windows.holdExpiringSoon.from.toISOString()).toBe(
          '2026-11-06T12:00:00.000Z',
        );
        // now + 6 hours = 2026-11-06T18:00:00.000Z
        expect(windows.holdExpiringSoon.to.toISOString()).toBe(
          '2026-11-06T18:00:00.000Z',
        );
      });

      it('accepts custom window overrides', () => {
        const windows = selectReminderWindows(baseNow, {
          dueSoonHours: 24,
          holdReminderHours: 3,
        });
        expect(windows.dueSoon.to.toISOString()).toBe(
          '2026-11-07T12:00:00.000Z',
        );
        expect(windows.holdExpiringSoon.to.toISOString()).toBe(
          '2026-11-06T15:00:00.000Z',
        );
      });

      it('throws on invalid date', () => {
        expect(() => selectReminderWindows(new Date('invalid'))).toThrow(
          /Invalid Date/,
        );
      });
    });

    describe('isLoanDueSoon', () => {
      const now = new Date('2026-11-06T12:00:00.000Z');
      const windowHours = 48;

      it('is true exactly at the window edge (due in exactly 48 hours)', () => {
        const dueAt = new Date('2026-11-08T12:00:00.000Z'); // now + 48h
        expect(isLoanDueSoon(dueAt, now, windowHours)).toBe(true);
      });

      it('is true just inside the window (due in 47h 59m 59s)', () => {
        const dueAt = new Date('2026-11-08T11:59:59.000Z');
        expect(isLoanDueSoon(dueAt, now, windowHours)).toBe(true);
      });

      it('is false just outside the window (due in 48h 1ms)', () => {
        const dueAt = new Date('2026-11-08T12:00:00.001Z');
        expect(isLoanDueSoon(dueAt, now, windowHours)).toBe(false);
      });

      it('is true when due right now (dueAt === now)', () => {
        expect(isLoanDueSoon(now, now, windowHours)).toBe(true);
      });

      it('is false when already overdue (dueAt < now)', () => {
        const dueAt = new Date('2026-11-06T11:59:59.999Z');
        expect(isLoanDueSoon(dueAt, now, windowHours)).toBe(false);
      });
    });

    describe('isLoanOverdue', () => {
      const dueAt = new Date('2026-11-06T12:00:00.000Z');

      it('is false before due date', () => {
        const now = new Date('2026-11-06T11:59:59.000Z');
        expect(isLoanOverdue(dueAt, now)).toBe(false);
      });

      it('is false exactly at the due instant (now === dueAt)', () => {
        const now = new Date('2026-11-06T12:00:00.000Z');
        expect(isLoanOverdue(dueAt, now)).toBe(false);
      });

      it('is true 1 millisecond past due date', () => {
        const now = new Date('2026-11-06T12:00:00.001Z');
        expect(isLoanOverdue(dueAt, now)).toBe(true);
      });

      it('is true long past due date', () => {
        const now = new Date('2026-11-07T12:00:00.000Z');
        expect(isLoanOverdue(dueAt, now)).toBe(true);
      });
    });

    describe('isHoldExpiringSoon', () => {
      const now = new Date('2026-11-06T12:00:00.000Z');
      const windowHours = 6;

      it('is true exactly at the window edge (expires in exactly 6 hours)', () => {
        const expiresAt = new Date('2026-11-06T18:00:00.000Z');
        expect(isHoldExpiringSoon(expiresAt, now, windowHours)).toBe(true);
      });

      it('is true just inside the window (expires in 5h 59m)', () => {
        const expiresAt = new Date('2026-11-06T17:59:00.000Z');
        expect(isHoldExpiringSoon(expiresAt, now, windowHours)).toBe(true);
      });

      it('is false just outside the window (expires in 6h 1ms)', () => {
        const expiresAt = new Date('2026-11-06T18:00:00.001Z');
        expect(isHoldExpiringSoon(expiresAt, now, windowHours)).toBe(false);
      });

      it('is false when already expired (expiresAt < now)', () => {
        const expiresAt = new Date('2026-11-06T11:59:59.000Z');
        expect(isHoldExpiringSoon(expiresAt, now, windowHours)).toBe(false);
      });
    });
  });

  describe('Lease helpers', () => {
    const now = new Date('2026-11-06T12:00:00.000Z');

    describe('isLeaseActive', () => {
      it('returns false for null or undefined lockedUntil', () => {
        expect(isLeaseActive(null, now)).toBe(false);
        expect(isLeaseActive(undefined, now)).toBe(false);
      });

      it('returns false for past or expired lockedUntil', () => {
        const past = new Date('2026-11-06T11:59:59.000Z');
        expect(isLeaseActive(past, now)).toBe(false);
      });

      it('returns false when lockedUntil equals now', () => {
        expect(isLeaseActive(now, now)).toBe(false);
      });

      it('returns true when lockedUntil is in the future', () => {
        const future = new Date('2026-11-06T12:00:01.000Z');
        expect(isLeaseActive(future, now)).toBe(true);
      });
    });

    describe('computeLeaseExpiry', () => {
      it('computes expiry as now + leaseSeconds', () => {
        const expiry = computeLeaseExpiry(now, 120);
        expect(expiry.toISOString()).toBe('2026-11-06T12:02:00.000Z');
      });

      it('defaults to LEASE_SECONDS (120s)', () => {
        const expiry = computeLeaseExpiry(now);
        expect(expiry.getTime() - now.getTime()).toBe(120 * 1000);
      });
    });
  });

  describe('Notification rules & computeBackoffMs', () => {
    it('defines expected notification constants', () => {
      expect(NOTIFICATION_MAX_ATTEMPTS).toBe(5);
      expect(NOTIFICATION_BATCH_SIZE).toBe(20);
      expect(NOTIFICATION_LOCK_SECONDS).toBe(120);
      expect(NOTIFICATION_RETENTION_DAYS).toBe(90);
      expect(NOTIFICATION_JOB_INTERVAL_SECONDS).toBe(30);
      expect(NOTIFICATION_BASE_BACKOFF_MS).toBe(30000);
      expect(NOTIFICATION_MAX_BACKOFF_MS).toBe(3600000);
    });

    it('computes attempt 0 with zero jitter as 30s (30,000ms)', () => {
      expect(computeBackoffMs(0, 0)).toBe(30000);
    });

    it('computes attempt 0 with 20% max jitter as 36s (36,000ms)', () => {
      expect(computeBackoffMs(0, 1.0)).toBe(36000);
    });

    it('computes attempt 1 with zero jitter as 60s (60,000ms)', () => {
      expect(computeBackoffMs(1, 0)).toBe(60000);
    });

    it('computes attempt 1 with 20% max jitter as 72s (72,000ms)', () => {
      expect(computeBackoffMs(1, 1.0)).toBe(72000);
    });

    it('computes attempt 2 with zero jitter as 120s (120,000ms)', () => {
      expect(computeBackoffMs(2, 0)).toBe(120000);
    });

    it('computes attempt 3 with zero jitter as 240s (240,000ms)', () => {
      expect(computeBackoffMs(3, 0)).toBe(240000);
    });

    it('computes attempt 4 with zero jitter as 480s (480,000ms)', () => {
      expect(computeBackoffMs(4, 0)).toBe(480000);
    });

    it('caps backoff at 1 hour (3,600,000ms) for high attempt numbers', () => {
      // 30s * 2^7 = 3,840,000ms > 3,600,000ms
      expect(computeBackoffMs(7, 0)).toBe(NOTIFICATION_MAX_BACKOFF_MS);
      expect(computeBackoffMs(10, 1.0)).toBe(NOTIFICATION_MAX_BACKOFF_MS);
      expect(computeBackoffMs(20, 0.5)).toBe(NOTIFICATION_MAX_BACKOFF_MS);
    });

    it('treats negative attempts safely as attempt 0', () => {
      expect(computeBackoffMs(-1, 0)).toBe(30000);
      expect(computeBackoffMs(-5, 1.0)).toBe(36000);
    });

    it('clamps random multiplier to [0, 1]', () => {
      expect(computeBackoffMs(0, 2.0)).toBe(36000);
      expect(computeBackoffMs(0, -1.0)).toBe(30000);
      expect(computeBackoffMs(0, NaN)).toBe(30000);
    });
  });
});
