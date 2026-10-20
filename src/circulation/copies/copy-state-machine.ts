import { CopyStatus } from '@prisma/client';
import { InvalidCopyStateTransitionError } from './errors/invalid-copy-state-transition.error';

/**
 * Represents the current status and lifecycle state of a physical book copy.
 */
export interface CopyState {
  status: CopyStatus;
  isRetired: boolean;
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Transition Table for Manual Status Changes (Stage 4).
 *
 * Rules:
 * - AVAILABLE <-> LOST
 * - AVAILABLE <-> DAMAGED
 * - LOST -> DAMAGED
 * - DAMAGED -> LOST
 * - ON_HOLD and BORROWED cannot be manually transitioned to or from.
 */
export const ALLOWED_MANUAL_TRANSITIONS: Readonly<
  Record<CopyStatus, readonly CopyStatus[]>
> = Object.freeze({
  [CopyStatus.AVAILABLE]: Object.freeze([CopyStatus.LOST, CopyStatus.DAMAGED]),
  [CopyStatus.LOST]: Object.freeze([CopyStatus.AVAILABLE, CopyStatus.DAMAGED]),
  [CopyStatus.DAMAGED]: Object.freeze([CopyStatus.AVAILABLE, CopyStatus.LOST]),
  [CopyStatus.ON_HOLD]: Object.freeze([]),
  [CopyStatus.BORROWED]: Object.freeze([]),
});

/**
 * Evaluates whether a manual transition from the current state to the target status is allowed.
 * Pure function with no side effects or database access.
 */
export function canTransitionManually(
  current: CopyState,
  targetStatus: CopyStatus,
): TransitionResult {
  if (current.isRetired) {
    return {
      allowed: false,
      reason: 'Retired copies accept no status changes.',
    };
  }

  if (
    current.status === CopyStatus.ON_HOLD ||
    current.status === CopyStatus.BORROWED
  ) {
    return {
      allowed: false,
      reason: `Copies with status '${current.status}' cannot be manually changed or retired.`,
    };
  }

  if (
    targetStatus === CopyStatus.ON_HOLD ||
    targetStatus === CopyStatus.BORROWED
  ) {
    return {
      allowed: false,
      reason: `Status '${targetStatus}' cannot be set manually. It is reserved for holds and loans workflows.`,
    };
  }

  if (current.status === targetStatus) {
    return {
      allowed: false,
      reason: `Copy is already in status '${targetStatus}'.`,
    };
  }

  const allowedTargets = ALLOWED_MANUAL_TRANSITIONS[current.status] ?? [];
  if (allowedTargets.includes(targetStatus)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Manual transition from '${current.status}' to '${targetStatus}' is not allowed.`,
  };
}

/**
 * Asserts that a manual transition is valid, throwing an InvalidCopyStateTransitionError if not.
 */
export function assertValidManualTransition(
  current: CopyState,
  targetStatus: CopyStatus,
): void {
  const result = canTransitionManually(current, targetStatus);
  if (!result.allowed) {
    throw new InvalidCopyStateTransitionError(
      result.reason ?? 'Invalid copy status transition.',
    );
  }
}

/**
 * Evaluates whether a copy can be retired.
 * A copy that is ON_HOLD or BORROWED cannot be retired, and already retired copies cannot be retired again.
 */
export function canRetireCopy(current: CopyState): TransitionResult {
  if (current.isRetired) {
    return {
      allowed: false,
      reason: 'Copy is already retired.',
    };
  }

  if (
    current.status === CopyStatus.ON_HOLD ||
    current.status === CopyStatus.BORROWED
  ) {
    return {
      allowed: false,
      reason: `Copies with status '${current.status}' cannot be retired.`,
    };
  }

  return { allowed: true };
}

/**
 * Asserts that a copy can be retired, throwing an InvalidCopyStateTransitionError if not.
 */
export function assertCanRetireCopy(current: CopyState): void {
  const result = canRetireCopy(current);
  if (!result.allowed) {
    throw new InvalidCopyStateTransitionError(
      result.reason ?? 'Copy cannot be retired.',
    );
  }
}
