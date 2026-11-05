import { FineStatus } from '@prisma/client';
import { InvalidFineStateTransitionError } from './errors/invalid-fine-state-transition.error';

export interface FineTransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Transition Table for Fine Lifecycle States (Stage 7).
 *
 * Rules:
 * - UNPAID -> PARTIALLY_PAID
 * - UNPAID -> PAID
 * - PARTIALLY_PAID -> PAID
 * - UNPAID -> WAIVED
 * - PARTIALLY_PAID -> WAIVED
 * - PAID and WAIVED are final/terminal states and accept no transitions.
 */
export const ALLOWED_FINE_TRANSITIONS: Readonly<
  Record<FineStatus, readonly FineStatus[]>
> = Object.freeze({
  [FineStatus.UNPAID]: Object.freeze([
    FineStatus.PARTIALLY_PAID,
    FineStatus.PAID,
    FineStatus.WAIVED,
  ]),
  [FineStatus.PARTIALLY_PAID]: Object.freeze([
    FineStatus.PAID,
    FineStatus.WAIVED,
  ]),
  [FineStatus.PAID]: Object.freeze([]),
  [FineStatus.WAIVED]: Object.freeze([]),
});

/**
 * Returns true if the status is a final, terminal fine status.
 */
export function isTerminalFineStatus(status: FineStatus): boolean {
  return status === FineStatus.PAID || status === FineStatus.WAIVED;
}

/**
 * Evaluates whether a transition from fromStatus to toStatus is valid.
 * Pure function with no side effects or database access.
 */
export function canTransitionFine(
  fromStatus: FineStatus,
  toStatus: FineStatus,
): FineTransitionResult {
  if (fromStatus === toStatus) {
    return {
      allowed: false,
      reason: `Fine is already in status '${fromStatus}'.`,
    };
  }

  if (isTerminalFineStatus(fromStatus)) {
    return {
      allowed: false,
      reason: `Fine status '${fromStatus}' is terminal and cannot transition to '${toStatus}'.`,
    };
  }

  const allowedTargets = ALLOWED_FINE_TRANSITIONS[fromStatus] ?? [];
  if (allowedTargets.includes(toStatus)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Cannot transition fine from '${fromStatus}' to '${toStatus}'. Allowed transitions: [${allowedTargets.join(', ')}].`,
  };
}

/**
 * Asserts that a fine transition is valid, throwing InvalidFineStateTransitionError if forbidden.
 */
export function assertValidFineTransition(
  fromStatus: FineStatus,
  toStatus: FineStatus,
): void {
  const result = canTransitionFine(fromStatus, toStatus);
  if (!result.allowed) {
    throw new InvalidFineStateTransitionError(
      result.reason ??
        `Invalid fine transition from '${fromStatus}' to '${toStatus}'.`,
    );
  }
}
