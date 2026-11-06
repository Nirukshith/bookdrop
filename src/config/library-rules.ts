import { DateTime } from 'luxon';

export const PICKUP_HOLD_DAYS = 1;
export const LOAN_DAYS = 14;
export const MAX_ACTIVE_LOANS = 3;
export const MAX_ACTIVE_HOLDS = 3;
export const MAX_ACTIVE_RESERVATIONS = 5;
export const MEMBER_ADVISORY_NAMESPACE = 4201;
export const BOOK_RESERVATION_ADVISORY_NAMESPACE = 4202;
export const MISSED_PICKUPS_BEFORE_FINE = 3;
export const MISSED_PICKUP_FINE_RS = 100;
export const MISSED_PICKUP_GRACE_MINUTES = 60;
export const DUE_SOON_HOURS = 48;
export const HOLD_REMINDER_HOURS = 6;
export const JOB_BATCH_SIZE = 100;
export const JOB_MAX_RUN_SECONDS = 50;
export const LEASE_SECONDS = 120;
export const EXPIRE_HOLDS_INTERVAL_SECONDS = 60;
export const REMINDERS_INTERVAL_SECONDS = 900; // 15 minutes
export const LATE_FEE_PER_DAY_RS = 10;
export const LATE_FEE_CAP_RS: number | null = null;
export const MAX_ASSESSED_FINE_RS = 100000;
export const MAX_BOOK_PRICE_RS = 1000000;
export const PAISE_PER_RUPEE = 100;
export const MAX_ASSESSED_FINE_MINOR = MAX_ASSESSED_FINE_RS * PAISE_PER_RUPEE;
export const MAX_BOOK_PRICE_MINOR = MAX_BOOK_PRICE_RS * PAISE_PER_RUPEE;
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

/**
 * Computes the number of local calendar days late between a loan's due date and its return date.
 * Both dates are evaluated in the library's IANA timezone (LIBRARY_TIMEZONE).
 *
 * Rules:
 * - Returning on or before the due day = 0 days late.
 * - Returning on the next local day (at 00:00 or later) = 1 day late.
 * - Never returns a negative number.
 *
 * @param dueAt The loan due date (instant in UTC).
 * @param returnedAt The instant the book is returned (instant in UTC).
 * @param timezone The library's IANA timezone (e.g. 'Asia/Colombo', 'America/New_York'). Default 'UTC'.
 * @returns Non-negative integer representing calendar days late.
 */
export function computeDaysLate(
  dueAt: Date,
  returnedAt: Date,
  timezone: string = DEFAULT_LIBRARY_TIMEZONE,
): number {
  const localDue = DateTime.fromJSDate(dueAt, { zone: timezone });
  const localReturned = DateTime.fromJSDate(returnedAt, { zone: timezone });

  if (!localDue.isValid || !localReturned.isValid) {
    throw new Error(
      `Invalid timezone or date provided to computeDaysLate: zone="${timezone}", dueAt="${dueAt.toISOString()}", returnedAt="${returnedAt.toISOString()}"`,
    );
  }

  const startOfDue = localDue.startOf('day');
  const startOfReturned = localReturned.startOf('day');

  const diffDays = Math.round(startOfReturned.diff(startOfDue, 'days').days);
  return Math.max(0, diffDays);
}

/**
 * Converts an integer Rupee amount to minor units (1 Rupee = 100 paise).
 *
 * @param rs Integer Rupee amount.
 * @returns Amount in minor units (paise).
 */
export function rsToMinor(rs: number): number {
  if (!Number.isInteger(rs)) {
    throw new Error(`Rupee amount must be an integer, received: ${rs}`);
  }
  return rs * PAISE_PER_RUPEE;
}

/**
 * Formats a minor unit integer into a standard Rupee decimal string (e.g. 1000 paise -> "10.00").
 *
 * @param minor Amount in minor units (paise).
 * @param prefix Optional prefix (e.g. "₹" or "Rs "). Defaults to "".
 * @returns Formatted decimal string.
 */
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
  return isNegative ? `-${prefix}${formatted}` : `${prefix}${formatted}`;
}

/**
 * Validates a staff-entered fine amount in Rupees.
 * Rejects non-integers, zero, negative amounts, and amounts exceeding MAX_ASSESSED_FINE_RS.
 *
 * @param rs Amount in Rupees.
 */
export function validateAssessedFineRs(rs: number): void {
  if (!Number.isInteger(rs)) {
    throw new Error(`Fine amount must be an integer, received: ${rs}`);
  }
  if (rs <= 0) {
    throw new Error(`Fine amount must be greater than zero, received: ${rs}`);
  }
  if (rs > MAX_ASSESSED_FINE_RS) {
    throw new Error(
      `Fine amount ${rs} Rs exceeds the maximum allowed fine of ${MAX_ASSESSED_FINE_RS} Rs`,
    );
  }
}

export const assertValidAssessedFineRs = validateAssessedFineRs;

/**
 * Validates a fine amount stored in minor units (paise).
 * Rejects non-integers, zero, negative amounts, and amounts exceeding MAX_ASSESSED_FINE_MINOR.
 *
 * @param minor Amount in minor units (paise).
 */
export function validateFineAmountMinor(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new Error(
      `Fine amount in minor units must be an integer, received: ${minor}`,
    );
  }
  if (minor <= 0) {
    throw new Error(
      `Fine amount in minor units must be greater than zero, received: ${minor}`,
    );
  }
  if (minor > MAX_ASSESSED_FINE_MINOR) {
    throw new Error(
      `Fine amount ${minor} minor units exceeds the maximum allowed fine of ${MAX_ASSESSED_FINE_MINOR}`,
    );
  }
}

export const assertValidFineAmountMinor = validateFineAmountMinor;

export interface LateFeeCapResolutionInput {
  loanSnapshotMinor?: number | null;
  bookCurrentPriceMinor?: number | null;
  globalCapRs?: number | null;
  snapshotMinor?: number | null;
  currentPriceMinor?: number | null;
}

/**
 * 4-Tier resolution hierarchy for late-return fine caps:
 * 1. Price snapshot captured at checkout time (loanSnapshotMinor).
 * 2. If loan predates snapshots: live book replacement price at return time (bookCurrentPriceMinor).
 * 3. Global library late fee cap in Rupees (globalCapRs), converted to minor units.
 * 4. Otherwise null (uncapped).
 */
export function resolveLateFeeCapMinor(
  input: LateFeeCapResolutionInput,
): number | null {
  const snapshot = input.loanSnapshotMinor ?? input.snapshotMinor;
  if (snapshot !== null && snapshot !== undefined) {
    return snapshot;
  }
  const current = input.bookCurrentPriceMinor ?? input.currentPriceMinor;
  if (current !== null && current !== undefined) {
    return current;
  }
  if (input.globalCapRs !== null && input.globalCapRs !== undefined) {
    return rsToMinor(input.globalCapRs);
  }
  return null;
}

export interface CalculateLateFeeInput {
  daysLate: number;
  ratePerDayRs?: number;
  capMinor?: number | null;
}

export interface CalculateLateFeeResult {
  uncappedAmountMinor: number;
  amountMinor: number;
  capMinor: number | null;
  wasCapped: boolean;
}

/**
 * Calculates late fee:
 * - uncappedAmountMinor = daysLate * ratePerDayRs * 100
 * - If capMinor is present: amountMinor = min(uncappedAmountMinor, capMinor)
 * - Else: amountMinor = uncappedAmountMinor
 */
export function calculateLateFee({
  daysLate,
  ratePerDayRs = LATE_FEE_PER_DAY_RS,
  capMinor = null,
}: CalculateLateFeeInput): CalculateLateFeeResult {
  if (!Number.isInteger(daysLate)) {
    throw new Error(`daysLate must be an integer, received: ${daysLate}`);
  }
  if (daysLate <= 0) {
    return {
      uncappedAmountMinor: 0,
      amountMinor: 0,
      capMinor: capMinor ?? null,
      wasCapped: false,
    };
  }
  if (!Number.isInteger(ratePerDayRs) || ratePerDayRs <= 0) {
    throw new Error(
      `ratePerDayRs must be a positive integer, received: ${ratePerDayRs}`,
    );
  }

  const uncappedAmountMinor = daysLate * ratePerDayRs * PAISE_PER_RUPEE;
  let amountMinor = uncappedAmountMinor;
  let wasCapped = false;

  if (capMinor !== null && capMinor !== undefined) {
    if (!Number.isInteger(capMinor) || capMinor < 0) {
      throw new Error(
        `capMinor must be a non-negative integer or null, received: ${capMinor}`,
      );
    }
    if (uncappedAmountMinor > capMinor) {
      amountMinor = capMinor;
      wasCapped = true;
    }
  }

  return {
    uncappedAmountMinor,
    amountMinor,
    capMinor: capMinor ?? null,
    wasCapped,
  };
}

/**
 * Computes the late fee in minor units (paise) given the number of days late,
 * daily late fee rate in Rupees, and an optional cap in Rupees.
 *
 * @param daysLate Number of calendar days late (>= 0).
 * @param ratePerDayRs Daily fee in Rupees (default: LATE_FEE_PER_DAY_RS = 10).
 * @param capRs Optional maximum fee cap in Rupees (default: LATE_FEE_CAP_RS = null).
 * @returns Fee amount in minor units (integer paise >= 0).
 */
export function computeLateFeeMinor(
  daysLate: number,
  ratePerDayRs: number = LATE_FEE_PER_DAY_RS,
  capRs: number | null = LATE_FEE_CAP_RS,
): number {
  if (!Number.isInteger(daysLate)) {
    throw new Error(`daysLate must be an integer, received: ${daysLate}`);
  }
  if (daysLate <= 0) {
    return 0;
  }
  if (!Number.isInteger(ratePerDayRs) || ratePerDayRs <= 0) {
    throw new Error(
      `ratePerDayRs must be a positive integer, received: ${ratePerDayRs}`,
    );
  }

  let capMinor: number | null = null;
  if (capRs !== null && capRs !== undefined) {
    if (!Number.isInteger(capRs) || capRs < 0) {
      throw new Error(
        `capRs must be a non-negative integer or null, received: ${capRs}`,
      );
    }
    capMinor = rsToMinor(capRs);
  }

  return calculateLateFee({ daysLate, ratePerDayRs, capMinor }).amountMinor;
}

/**
 * Result of partitioning unassessed missed pickups into groups eligible for fines.
 */
export interface MissedPickupsAssessmentResult<T> {
  groups: T[][];
  toAssess: T[][]; // Convenient alias for groups
  remainder: T[];
}

/**
 * Groups unassessed, non-excused missed pickups (oldest first) into batches of `threshold`
 * (default 3) for fine assessment, leaving any remainder for future accumulation.
 *
 * @param unassessed Array of unassessed missed pickups sorted oldest-first.
 * @param threshold Number of missed pickups required to trigger a fine (default: 3).
 * @returns Groups of items to be fined, plus the remainder.
 */
export function selectMissedPickupsToAssess<T>(
  unassessed: T[],
  threshold: number = MISSED_PICKUPS_BEFORE_FINE,
): MissedPickupsAssessmentResult<T> {
  if (!Number.isInteger(threshold) || threshold <= 0) {
    throw new Error(
      `threshold must be a positive integer, received: ${threshold}`,
    );
  }

  const groups: T[][] = [];
  const total = unassessed.length;
  const numGroups = Math.floor(total / threshold);

  for (let i = 0; i < numGroups; i++) {
    const start = i * threshold;
    groups.push(unassessed.slice(start, start + threshold));
  }

  const remainder = unassessed.slice(numGroups * threshold);

  return {
    groups,
    toAssess: groups,
    remainder,
  };
}

/**
 * Evaluates whether an expired hold's processing was delayed beyond the system grace period.
 * If the system caught up late (e.g. server shutdown or backlog > graceMinutes),
 * the hold is excused so the member is not penalized for infrastructure downtime.
 *
 * @param expiresAt The hold's scheduled expiration instant.
 * @param processedAt The current instant at which the expiration job runs.
 * @param graceMinutes Grace threshold in minutes (default: MISSED_PICKUP_GRACE_MINUTES = 60).
 * @returns true if delay > graceMinutes, false otherwise.
 */
export function isExcusedAsSystemDelay(
  expiresAt: Date,
  processedAt: Date,
  graceMinutes: number = MISSED_PICKUP_GRACE_MINUTES,
): boolean {
  if (isNaN(expiresAt.getTime()) || isNaN(processedAt.getTime())) {
    throw new Error('Invalid Date provided to isExcusedAsSystemDelay');
  }
  const delayMs = processedAt.getTime() - expiresAt.getTime();
  const graceMs = graceMinutes * 60 * 1000;
  return delayMs > graceMs;
}

export interface ReminderQueryWindows {
  dueSoon: { from: Date; to: Date };
  overdue: { before: Date };
  holdExpiringSoon: { from: Date; to: Date };
}

/**
 * Computes database query timestamp ranges for reminder candidate selection.
 *
 * @param now Current clock instant.
 * @param options Configurable window hours.
 */
export function selectReminderWindows(
  now: Date,
  options?: { dueSoonHours?: number; holdReminderHours?: number },
): ReminderQueryWindows {
  if (isNaN(now.getTime())) {
    throw new Error('Invalid Date provided to selectReminderWindows');
  }
  const dueSoonHours = options?.dueSoonHours ?? DUE_SOON_HOURS;
  const holdReminderHours = options?.holdReminderHours ?? HOLD_REMINDER_HOURS;

  return {
    dueSoon: {
      from: now,
      to: new Date(now.getTime() + dueSoonHours * 60 * 60 * 1000),
    },
    overdue: {
      before: now,
    },
    holdExpiringSoon: {
      from: now,
      to: new Date(now.getTime() + holdReminderHours * 60 * 60 * 1000),
    },
  };
}

/**
 * Checks if a loan is due soon (i.e. due within windowHours from now, and not already overdue).
 */
export function isLoanDueSoon(
  dueAt: Date,
  now: Date,
  windowHours: number = DUE_SOON_HOURS,
): boolean {
  const diffMs = dueAt.getTime() - now.getTime();
  const windowMs = windowHours * 60 * 60 * 1000;
  return diffMs >= 0 && diffMs <= windowMs;
}

/**
 * Checks if a loan is overdue (i.e. current time is strictly after due date).
 */
export function isLoanOverdue(dueAt: Date, now: Date): boolean {
  return now.getTime() > dueAt.getTime();
}

/**
 * Checks if an active hold is expiring soon (i.e. expiring within windowHours from now, and not already expired).
 */
export function isHoldExpiringSoon(
  expiresAt: Date,
  now: Date,
  windowHours: number = HOLD_REMINDER_HOURS,
): boolean {
  const diffMs = expiresAt.getTime() - now.getTime();
  const windowMs = windowHours * 60 * 60 * 1000;
  return diffMs >= 0 && diffMs <= windowMs;
}

/**
 * Pure helper for lease validity.
 */
export function isLeaseActive(
  lockedUntil: Date | null | undefined,
  now: Date,
): boolean {
  if (!lockedUntil || isNaN(lockedUntil.getTime())) {
    return false;
  }
  return lockedUntil.getTime() > now.getTime();
}

/**
 * Computes future lease expiration instant.
 */
export function computeLeaseExpiry(
  now: Date,
  leaseSeconds: number = LEASE_SECONDS,
): Date {
  return new Date(now.getTime() + leaseSeconds * 1000);
}
