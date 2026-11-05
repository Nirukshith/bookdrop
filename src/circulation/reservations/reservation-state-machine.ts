import { InvalidReservationStateTransitionError } from './errors/invalid-reservation-state-transition.error';

/**
 * Lifecycle statuses for a patron book reservation (queue entry).
 * Matches Prisma's ReservationStatus enum.
 */
export enum ReservationStatus {
  WAITING = 'WAITING',
  PROMOTED = 'PROMOTED',
  CANCELLED = 'CANCELLED',
}

/**
 * Reason a waiting reservation was cancelled.
 * Matches Prisma's ReservationCancelReason enum.
 */
export enum ReservationCancelReason {
  MEMBER = 'MEMBER',
  STAFF = 'STAFF',
  SUPERSEDED = 'SUPERSEDED',
}

/**
 * Transition Table for Reservation Lifecycle States.
 *
 * Rules:
 * - WAITING -> PROMOTED (copy became available and member was eligible)
 * - WAITING -> CANCELLED (cancelled by member, staff, or superseded by hold/checkout)
 * - PROMOTED and CANCELLED are final terminal states and accept no further transitions.
 */
export const ALLOWED_RESERVATION_TRANSITIONS: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = Object.freeze({
  [ReservationStatus.WAITING]: Object.freeze([
    ReservationStatus.PROMOTED,
    ReservationStatus.CANCELLED,
  ]),
  [ReservationStatus.PROMOTED]: Object.freeze([]),
  [ReservationStatus.CANCELLED]: Object.freeze([]),
});

/**
 * Returns whether a status is a final, terminal state for a reservation.
 */
export function isTerminalReservationStatus(
  status: ReservationStatus,
): boolean {
  return (
    status === ReservationStatus.PROMOTED ||
    status === ReservationStatus.CANCELLED
  );
}

/**
 * Evaluates whether a transition from one reservation status to another is permitted.
 */
export function canTransitionReservation(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  const allowed = ALLOWED_RESERVATION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Validates a reservation state transition and throws InvalidReservationStateTransitionError
 * if the transition is prohibited.
 */
export function assertValidReservationTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): void {
  if (!canTransitionReservation(from, to)) {
    throw new InvalidReservationStateTransitionError(
      `Invalid reservation transition: Cannot transition from ${from} to ${to}`,
    );
  }
}
