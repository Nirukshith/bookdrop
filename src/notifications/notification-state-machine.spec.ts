import { NotificationStatus } from './notification.types';
import {
  ALLOWED_NOTIFICATION_TRANSITIONS,
  canTransitionNotification,
  transitionNotification,
  InvalidNotificationStateTransitionError,
} from './notification-state-machine';

describe('NotificationStateMachine (Pure Logic Unit Tests)', () => {
  const allStatuses: NotificationStatus[] = [
    NotificationStatus.PENDING,
    NotificationStatus.SENDING,
    NotificationStatus.SENT,
    NotificationStatus.FAILED,
    NotificationStatus.CANCELLED,
  ];

  const allowedPairs: [NotificationStatus, NotificationStatus][] = [
    [NotificationStatus.PENDING, NotificationStatus.SENDING],
    [NotificationStatus.PENDING, NotificationStatus.CANCELLED],
    [NotificationStatus.SENDING, NotificationStatus.SENT],
    [NotificationStatus.SENDING, NotificationStatus.PENDING],
    [NotificationStatus.SENDING, NotificationStatus.FAILED],
    [NotificationStatus.FAILED, NotificationStatus.PENDING],
  ];

  describe('Allowed transitions', () => {
    allowedPairs.forEach(([from, to]) => {
      it(`allows transition from ${from} to ${to}`, () => {
        expect(canTransitionNotification(from, to)).toBe(true);
        expect(transitionNotification(from, to)).toBe(to);
      });
    });
  });

  describe('Forbidden transitions', () => {
    allStatuses.forEach((from) => {
      allStatuses.forEach((to) => {
        const isAllowed = allowedPairs.some(
          ([allowedFrom, allowedTo]) =>
            allowedFrom === from && allowedTo === to,
        );

        if (!isAllowed) {
          it(`forbids transition from ${from} to ${to}`, () => {
            expect(canTransitionNotification(from, to)).toBe(false);
            expect(() => transitionNotification(from, to)).toThrow(
              InvalidNotificationStateTransitionError,
            );
          });
        }
      });
    });
  });

  describe('Terminal state guarantees', () => {
    it('SENT has zero outgoing transitions', () => {
      expect(
        ALLOWED_NOTIFICATION_TRANSITIONS[NotificationStatus.SENT].size,
      ).toBe(0);
      allStatuses.forEach((to) => {
        expect(canTransitionNotification(NotificationStatus.SENT, to)).toBe(
          false,
        );
      });
    });

    it('CANCELLED has zero outgoing transitions', () => {
      expect(
        ALLOWED_NOTIFICATION_TRANSITIONS[NotificationStatus.CANCELLED].size,
      ).toBe(0);
      allStatuses.forEach((to) => {
        expect(
          canTransitionNotification(NotificationStatus.CANCELLED, to),
        ).toBe(false);
      });
    });
  });
});
