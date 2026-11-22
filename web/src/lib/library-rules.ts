/**
 * Member limits, mirrored from services/library-core/src/config/library-rules.ts.
 * The backend is the source of truth and enforces these; the UI uses them only
 * to warn early and to word messages. Keep the two files in sync.
 */
export const MAX_ACTIVE_HOLDS = 3;
export const MAX_ACTIVE_LOANS = 3;
export const MAX_ACTIVE_RESERVATIONS = 5;
/** Hours a reserved copy waits at the pickup desk (PICKUP_HOLD_DAYS = 1). */
export const PICKUP_HOLD_HOURS = 24;
export const LATE_FEE_PER_DAY_RS = 10;
