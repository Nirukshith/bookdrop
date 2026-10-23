import { DateTime } from 'luxon';

export const PICKUP_HOLD_DAYS = 1;
export const LOAN_DAYS = 14;
export const MAX_ACTIVE_LOANS = 3;
export const MAX_ACTIVE_HOLDS = 3;
export const MISSED_PICKUPS_BEFORE_FINE = 3;
export const MISSED_PICKUP_FINE_RS = 100;
export const LATE_FEE_PER_DAY_RS = 10;
export const DEFAULT_LIBRARY_TIMEZONE = 'UTC';

/**
 * Calculates the pickup deadline for a hold in strict UTC (createdAt plus PICKUP_HOLD_DAYS days).
 * Kept in one central function so hold window policies (e.g. holidays or operating hours) can change centrally.
 */
export function computePickupDeadline(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + PICKUP_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Backward-compatible alias for computePickupDeadline.
 */
export const calculateHoldExpiresAt = computePickupDeadline;

/**
 * Computes the due date for a loan as a pure function.
 * Given a checkout instant (`borrowedAt`), a library IANA timezone, and a loan duration in calendar days,
 * returns the end of the local day (23:59:59.999 local time), `days` calendar days later,
 * as a UTC instant (Date).
 *
 * Uses Luxon for IANA timezone calendar arithmetic.
 *
 * @param borrowedAt The Date at which the copy was borrowed.
 * @param timezone The IANA timezone name of the library (e.g. 'Asia/Colombo', 'America/New_York'). Default 'UTC'.
 * @param days Number of calendar days for the loan (default: LOAN_DAYS = 14).
 * @returns Date instant in UTC representing 23:59:59.999 in the library's local timezone.
 */
export function computeDueDate(
  borrowedAt: Date,
  timezone: string = DEFAULT_LIBRARY_TIMEZONE,
  days: number = LOAN_DAYS,
): Date {
  const localBorrowed = DateTime.fromJSDate(borrowedAt, { zone: timezone });

  if (!localBorrowed.isValid) {
    throw new Error(
      `Invalid timezone or date provided to computeDueDate: zone="${timezone}", date="${borrowedAt.toISOString()}"`,
    );
  }

  // Add calendar days in the local timezone, then set to the end of that local day (23:59:59.999)
  const localDueDate = localBorrowed.plus({ days }).endOf('day');

  // Convert the local end-of-day back to a UTC JavaScript Date
  return localDueDate.toJSDate();
}
