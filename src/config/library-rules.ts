export const PICKUP_HOLD_DAYS = 1;
export const LOAN_DAYS = 14;
export const MAX_ACTIVE_LOANS = 3;
export const MAX_ACTIVE_HOLDS = 3;
export const MISSED_PICKUPS_BEFORE_FINE = 3;
export const MISSED_PICKUP_FINE_RS = 100;
export const LATE_FEE_PER_DAY_RS = 10;

/**
 * Calculates the pickup deadline for a hold (PICKUP_HOLD_DAYS from the request).
 * Kept in one function so hold window policies (e.g. holidays or operating hours) can change centrally.
 */
export function calculateHoldExpiresAt(fromDate: Date = new Date()): Date {
  const expiresAt = new Date(fromDate);
  expiresAt.setDate(expiresAt.getDate() + PICKUP_HOLD_DAYS);
  return expiresAt;
}
