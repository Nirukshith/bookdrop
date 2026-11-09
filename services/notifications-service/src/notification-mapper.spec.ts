import { DOMAIN_EVENT_NAMES } from './contracts/events';
import { mapEventToNotification } from './notification-mapper';
import { NotificationTemplate } from './notification.types';

describe('mapEventToNotification (Mapping Table Unit Tests)', () => {
  const expiresAt = new Date('2026-11-10T12:00:00.000Z');
  const dueAt = new Date('2026-11-20T23:59:59.000Z');

  describe('Hold lifecycle events', () => {
    it('maps hold.created with source=REQUEST to HOLD_CONFIRMED', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.HOLD_CREATED,
        holdId: 101,
        userId: 42,
        bookId: 5,
        copyId: 12,
        expiresAt,
        source: 'REQUEST',
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 42,
        template: NotificationTemplate.HOLD_CONFIRMED,
        dedupeKey: 'hold-confirmed:101',
        validUntil: expiresAt,
        payload: {
          holdId: 101,
          bookId: 5,
          copyId: 12,
          expiresAt,
        },
      });
    });

    it('skips hold.created when source=QUEUE_PROMOTION (covered by reservation.promoted)', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.HOLD_CREATED,
        holdId: 102,
        userId: 42,
        bookId: 5,
        copyId: 12,
        expiresAt,
        source: 'QUEUE_PROMOTION',
      };
      expect(mapEventToNotification(event)).toBeNull();
    });

    it('maps reservation.promoted to RESERVATION_READY with hold expiration', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.RESERVATION_PROMOTED,
        reservationId: 88,
        holdId: 103,
        userId: 43,
        bookId: 5,
        copyId: 13,
        expiresAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 43,
        template: NotificationTemplate.RESERVATION_READY,
        dedupeKey: 'reservation-ready:88',
        validUntil: expiresAt,
        payload: {
          reservationId: 88,
          holdId: 103,
          bookId: 5,
          copyId: 13,
          expiresAt,
        },
      });
    });

    it('maps hold.expiring_soon to HOLD_EXPIRING_SOON with expiresAt validUntil', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.HOLD_EXPIRING_SOON,
        holdId: 104,
        userId: 44,
        bookId: 6,
        expiresAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 44,
        template: NotificationTemplate.HOLD_EXPIRING_SOON,
        dedupeKey: 'hold-expiring:104',
        validUntil: expiresAt,
        payload: {
          holdId: 104,
          bookId: 6,
          expiresAt,
        },
      });
    });

    it('maps hold.cancelled to HOLD_CANCELLED_BY_STAFF when cancelledBy=staff', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.HOLD_CANCELLED,
        holdId: 105,
        userId: 45,
        bookId: 7,
        cancelledBy: 'staff',
        reason: 'Item damaged',
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 45,
        template: NotificationTemplate.HOLD_CANCELLED_BY_STAFF,
        dedupeKey: 'hold-cancelled:105',
        validUntil: undefined,
        payload: {
          holdId: 105,
          bookId: 7,
          cancelledBy: 'staff',
          reason: 'Item damaged',
        },
      });
    });

    it('skips hold.cancelled when cancelledBy=member', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.HOLD_CANCELLED,
        holdId: 106,
        userId: 45,
        bookId: 7,
        cancelledBy: 'member',
      };
      expect(mapEventToNotification(event)).toBeNull();
    });

    it('skips hold.expired (covered by missed_pickup.recorded)', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.HOLD_EXPIRED,
        holdId: 107,
        userId: 46,
        bookId: 8,
      };
      expect(mapEventToNotification(event)).toBeNull();
    });

    it('maps unexcused missed_pickup.recorded to HOLD_EXPIRED_MISSED', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.MISSED_PICKUP_RECORDED,
        holdId: 108,
        userId: 47,
        bookId: 9,
        excused: false,
        unassessedCount: 2,
        threshold: 3,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 47,
        template: NotificationTemplate.HOLD_EXPIRED_MISSED,
        dedupeKey: 'hold-expired:108',
        validUntil: undefined,
        payload: {
          holdId: 108,
          bookId: 9,
          unassessedCount: 2,
          threshold: 3,
          excused: false,
        },
      });
    });

    it('maps excused missed_pickup.recorded to HOLD_EXPIRED_EXCUSED', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.MISSED_PICKUP_RECORDED,
        holdId: 109,
        userId: 48,
        bookId: 9,
        excused: true,
        reason: 'SYSTEM_DELAY',
        unassessedCount: 1,
        threshold: 3,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 48,
        template: NotificationTemplate.HOLD_EXPIRED_EXCUSED,
        dedupeKey: 'hold-expired:109',
        validUntil: undefined,
        payload: {
          holdId: 109,
          bookId: 9,
          excused: true,
          reason: 'SYSTEM_DELAY',
        },
      });
    });

    it('maps missed_pickup.fine_assessed to MISSED_PICKUP_FINE', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.MISSED_PICKUP_FINE_ASSESSED,
        fineId: 301,
        userId: 49,
        amountMinor: 10000,
        holdIds: [101, 102, 103],
        missedPickupIds: [1, 2, 3],
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 49,
        template: NotificationTemplate.MISSED_PICKUP_FINE,
        dedupeKey: 'missed-fine:301',
        validUntil: undefined,
        payload: {
          fineId: 301,
          amountMinor: 10000,
          holdIds: [101, 102, 103],
          missedPickupIds: [1, 2, 3],
        },
      });
    });
  });

  describe('Loan lifecycle events', () => {
    it('maps loan.started to LOAN_STARTED with due date', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.LOAN_STARTED,
        loanId: 201,
        userId: 50,
        bookId: 10,
        dueAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 50,
        template: NotificationTemplate.LOAN_STARTED,
        dedupeKey: 'loan-started:201',
        validUntil: undefined,
        payload: {
          loanId: 201,
          bookId: 10,
          dueAt,
        },
      });
    });

    it('maps loan.due_soon to LOAN_DUE_SOON with dueAt validUntil', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.LOAN_DUE_SOON,
        loanId: 202,
        userId: 51,
        bookId: 11,
        dueAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 51,
        template: NotificationTemplate.LOAN_DUE_SOON,
        dedupeKey: 'loan-due-soon:202',
        validUntil: dueAt,
        payload: {
          loanId: 202,
          bookId: 11,
          dueAt,
        },
      });
    });

    it('maps loan.overdue to LOAN_OVERDUE with daysLate', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.LOAN_OVERDUE,
        loanId: 203,
        userId: 52,
        bookId: 12,
        dueAt,
        daysLate: 4,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 52,
        template: NotificationTemplate.LOAN_OVERDUE,
        dedupeKey: 'loan-overdue:203',
        validUntil: undefined,
        payload: {
          loanId: 203,
          bookId: 12,
          dueAt,
          daysLate: 4,
        },
      });
    });

    it('maps loan.returned to RETURN_RECEIPT when daysLate=0 and condition=GOOD', () => {
      const returnedAt = new Date();
      const event = {
        eventName: DOMAIN_EVENT_NAMES.LOAN_RETURNED,
        loanId: 204,
        userId: 53,
        bookId: 13,
        daysLate: 0,
        condition: 'GOOD',
        returnedAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 53,
        template: NotificationTemplate.RETURN_RECEIPT,
        dedupeKey: 'return-receipt:204',
        validUntil: undefined,
        payload: {
          loanId: 204,
          bookId: 13,
          condition: 'GOOD',
          returnedAt,
        },
      });
    });

    it('skips loan.returned when daysLate > 0 (covered by fine email)', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.LOAN_RETURNED,
        loanId: 205,
        userId: 54,
        bookId: 14,
        daysLate: 2,
        condition: 'GOOD',
      };
      expect(mapEventToNotification(event)).toBeNull();
    });

    it('skips loan.returned when condition is DAMAGED (covered by fine email)', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.LOAN_RETURNED,
        loanId: 206,
        userId: 55,
        bookId: 15,
        daysLate: 0,
        condition: 'DAMAGED',
      };
      expect(mapEventToNotification(event)).toBeNull();
    });
  });

  describe('Fine & Registration events', () => {
    it('maps fine.created to FINE_ASSESSED when reason != MISSED_PICKUPS', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.FINE_CREATED,
        fineId: 401,
        userId: 56,
        reason: 'LATE_RETURN',
        amountMinor: 3000,
        loanId: 205,
        bookId: 14,
        daysLate: 3,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 56,
        template: NotificationTemplate.FINE_ASSESSED,
        dedupeKey: 'fine-assessed:401',
        validUntil: undefined,
        payload: {
          fineId: 401,
          reason: 'LATE_RETURN',
          amountMinor: 3000,
          loanId: 205,
          bookId: 14,
          daysLate: 3,
        },
      });
    });

    it('skips fine.created when reason = MISSED_PICKUPS (covered by missed_pickup.fine_assessed)', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.FINE_CREATED,
        fineId: 402,
        userId: 57,
        reason: 'MISSED_PICKUPS',
        amountMinor: 10000,
      };
      expect(mapEventToNotification(event)).toBeNull();
    });

    it('maps fine.settled with status=PAID to FINE_PAID', () => {
      const settledAt = new Date();
      const event = {
        eventName: DOMAIN_EVENT_NAMES.FINE_SETTLED,
        fineId: 403,
        userId: 58,
        status: 'PAID',
        reason: 'LATE_RETURN',
        amountMinor: 3000,
        settledAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 58,
        template: NotificationTemplate.FINE_PAID,
        dedupeKey: 'fine-settled:403',
        validUntil: undefined,
        payload: {
          fineId: 403,
          amountMinor: 3000,
          reason: 'LATE_RETURN',
        },
      });
    });

    it('maps fine.settled with status=WAIVED to FINE_WAIVED', () => {
      const settledAt = new Date();
      const event = {
        eventName: DOMAIN_EVENT_NAMES.FINE_SETTLED,
        fineId: 404,
        userId: 59,
        status: 'WAIVED',
        reason: 'LOST_BOOK',
        amountMinor: 15000,
        settledAt,
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 59,
        template: NotificationTemplate.FINE_WAIVED,
        dedupeKey: 'fine-settled:404',
        validUntil: undefined,
        payload: {
          fineId: 404,
          amountMinor: 15000,
          reason: 'LOST_BOOK',
        },
      });
    });

    it('maps user.registered to WELCOME', () => {
      const event = {
        eventName: DOMAIN_EVENT_NAMES.USER_REGISTERED,
        userId: 60,
        email: 'newuser@example.com',
        name: 'New Patron',
      };
      const result = mapEventToNotification(event);
      expect(result).toEqual({
        userId: 60,
        template: NotificationTemplate.WELCOME,
        dedupeKey: 'welcome:60',
        validUntil: undefined,
        payload: {
          userId: 60,
          email: 'newuser@example.com',
          name: 'New Patron',
        },
      });
    });

    it('returns null for unhandled or unknown domain event names', () => {
      expect(
        mapEventToNotification({ eventName: 'copy.created' as any }),
      ).toBeNull();
      expect(mapEventToNotification(null as any)).toBeNull();
      expect(mapEventToNotification({} as any)).toBeNull();
    });
  });
});
