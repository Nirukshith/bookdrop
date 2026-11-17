import { InvalidHoldStateTransitionError } from './errors/invalid-hold-state-transition.error';

/**
 * Lifecycle statuses for a patron hold request.
 * Matches Prisma's HoldStatus enum.
 */
export enum HoldStatus {
  ACTIVE = 'ACTIVE',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface HoldTransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Transition Table for Hold Lifecycle States.
 *
 * Rules:
 * - ACTIVE -> FULFILLED (picked up at desk)
 * - ACTIVE -> CANCELLED (cancelled by patron or staff)
 * - ACTIVE -> EXPIRED (pickup deadline passed)
 * - FULFILLED, CANCELLED, and EXPIRED are terminal states and accept no transitions.
 */
export const ALLOWED_HOLD_TRANSITIONS: Readonly<
  Record<HoldStatus, readonly HoldStatus[]>
> = Object.freeze({
  [HoldStatus.ACTIVE]: Object.freeze([
    HoldStatus.FULFILLED,
    HoldStatus.CANCELLED,
    HoldStatus.EXPIRED,
  ]),
  [HoldStatus.FULFILLED]: Object.freeze([]),
  [HoldStatus.CANCELLED]: Object.freeze([]),
  [HoldStatus.EXPIRED]: Object.freeze([]),
});

/**
 * Returns whether a status is a final, terminal state for a hold.
 */
export function isTerminalHoldStatus(status: HoldStatus): boolean {
  return (
    status === HoldStatus.FULFILLED ||
    status === HoldStatus.CANCELLED ||
    status === HoldStatus.EXPIRED
  );
}

/**
 * Evaluates whether a transition from fromStatus to toStatus is valid.
 * Pure function with no side effects or database access.
 */
export function canTransitionHold(
  fromStatus: HoldStatus,
  toStatus: HoldStatus,
): HoldTransitionResult {
  if (fromStatus === toStatus) {
    return {
      allowed: false,
      reason: `Hold is already in status '${fromStatus}'.`,
    };
  }

  if (isTerminalHoldStatus(fromStatus)) {
    return {
      allowed: false,
      reason: `Hold status '${fromStatus}' is terminal and cannot transition to '${toStatus}'.`,
    };
  }

  const allowedTargets = ALLOWED_HOLD_TRANSITIONS[fromStatus] || [];
  if (!allowedTargets.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition hold from '${fromStatus}' to '${toStatus}'. Allowed transitions from '${fromStatus}': [${allowedTargets.join(', ')}].`,
    };
  }

  return { allowed: true };
}

/**
 * Asserts that a transition from fromStatus to toStatus is valid,
 * throwing InvalidHoldStateTransitionError if forbidden.
 */
export function assertValidHoldTransition(
  fromStatus: HoldStatus,
  toStatus: HoldStatus,
): void {
  const result = canTransitionHold(fromStatus, toStatus);
  if (!result.allowed) {
    throw new InvalidHoldStateTransitionError(
      result.reason ||
        `Invalid hold transition from '${fromStatus}' to '${toStatus}'.`,
    );
  }
}
