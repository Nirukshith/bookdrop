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
  LOAN_DAYS,
  MAX_ACTIVE_LOANS,
  MAX_ACTIVE_HOLDS,
  LATE_FEE_PER_DAY_RS,
  LATE_FEE_CAP_RS,
  MAX_ASSESSED_FINE_RS,
  MAX_ASSESSED_FINE_MINOR,
  PAISE_PER_RUPEE,
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
      expect(() =>
        calculateLateFee({ daysLate: 2, capMinor: -100 }),
      ).toThrow(/capMinor must be a non-negative integer or null/);
      expect(() =>
        calculateLateFee({ daysLate: 2, capMinor: 10.5 }),
      ).toThrow(/capMinor must be a non-negative integer or null/);
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
});
