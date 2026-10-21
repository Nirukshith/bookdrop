export const PICKUP_HOLD_DAYS = 1;
export const LOAN_DAYS = 14;
export const MAX_ACTIVE_LOANS = 3;
export const MAX_ACTIVE_HOLDS = 3;
export const MISSED_PICKUPS_BEFORE_FINE = 3;
export const MISSED_PICKUP_FINE_RS = 100;
export const LATE_FEE_PER_DAY_RS = 10;

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
