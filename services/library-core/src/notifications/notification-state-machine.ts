import { NotificationStatus } from './notification.types';

export class InvalidNotificationStateTransitionError extends Error {
  constructor(
    public readonly fromState: NotificationStatus,
    public readonly toState: NotificationStatus,
  ) {
    super(
      `Invalid notification state transition: cannot transition from ${fromState} to ${toState}.`,
    );
    this.name = 'InvalidNotificationStateTransitionError';
  }
}

/**
 * Strict transition matrix for notification lifecycle:
 * - PENDING -> SENDING
 * - SENDING -> SENT
 * - SENDING -> PENDING (retry)
 * - SENDING -> FAILED
 * - PENDING -> CANCELLED
 * - FAILED -> PENDING (manual retry)
 * - SENT and CANCELLED are terminal/final states.
 */
export const ALLOWED_NOTIFICATION_TRANSITIONS: Readonly<
  Record<NotificationStatus, ReadonlySet<NotificationStatus>>
> = {
  [NotificationStatus.PENDING]: new Set([
    NotificationStatus.SENDING,
    NotificationStatus.CANCELLED,
  ]),
  [NotificationStatus.SENDING]: new Set([
    NotificationStatus.SENT,
    NotificationStatus.PENDING,
    NotificationStatus.FAILED,
  ]),
  [NotificationStatus.FAILED]: new Set([NotificationStatus.PENDING]),
  [NotificationStatus.SENT]: new Set(),
  [NotificationStatus.CANCELLED]: new Set(),
};

/**
 * Pure predicate checking whether a notification transition is allowed.
 */
export function canTransitionNotification(
  from: NotificationStatus,
  to: NotificationStatus,
): boolean {
  const allowedNext = ALLOWED_NOTIFICATION_TRANSITIONS[from];
  return allowedNext ? allowedNext.has(to) : false;
}

/**
 * Pure transition function enforcing the notification state machine.
 * Throws InvalidNotificationStateTransitionError if transition is forbidden.
 */
export function transitionNotification(
  from: NotificationStatus,
  to: NotificationStatus,
): NotificationStatus {
  if (!canTransitionNotification(from, to)) {
    throw new InvalidNotificationStateTransitionError(from, to);
  }
  return to;
}
