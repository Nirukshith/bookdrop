import { DOMAIN_EVENT_NAMES } from './contracts/events';
import { MappedNotification, NotificationTemplate } from './notification.types';

export interface DomainEventLike {
  eventName: string;
  [key: string]: any;
}

/**
 * Pure function implementing the domain event to notification mapping table.
 *
 * Rules:
 * - One email per business moment
 * - Time-sensitive messages include a validUntil instant; non-time-sensitive do not
 * - Stale, duplicate, or irrelevant moments return null (skipped)
 */
export function mapEventToNotification(
  event: DomainEventLike,
): MappedNotification | null {
  if (!event || !event.eventName) {
    return null;
  }

  switch (event.eventName) {
    case DOMAIN_EVENT_NAMES.HOLD_CREATED: {
      // source = QUEUE_PROMOTION is covered by reservation.promoted
      if (event.source === 'QUEUE_PROMOTION') {
        return null;
      }
      return {
        userId: event.userId,
        template: NotificationTemplate.HOLD_CONFIRMED,
        dedupeKey: `hold-confirmed:${event.holdId}`,
        validUntil: event.expiresAt ? new Date(event.expiresAt) : undefined,
        payload: {
          holdId: event.holdId,
          bookId: event.bookId,
          copyId: event.copyId,
          expiresAt: event.expiresAt,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.RESERVATION_PROMOTED: {
      return {
        userId: event.userId,
        template: NotificationTemplate.RESERVATION_READY,
        dedupeKey: `reservation-ready:${event.reservationId}`,
        validUntil: event.expiresAt ? new Date(event.expiresAt) : undefined,
        payload: {
          reservationId: event.reservationId,
          holdId: event.holdId,
          bookId: event.bookId,
          copyId: event.copyId,
          expiresAt: event.expiresAt,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.HOLD_EXPIRING_SOON: {
      return {
        userId: event.userId,
        template: NotificationTemplate.HOLD_EXPIRING_SOON,
        dedupeKey: `hold-expiring:${event.holdId}`,
        validUntil: event.expiresAt ? new Date(event.expiresAt) : undefined,
        payload: {
          holdId: event.holdId,
          bookId: event.bookId,
          expiresAt: event.expiresAt,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.HOLD_CANCELLED: {
      // Cancelled by member is initiated by themselves, so no email is sent.
      // Cancelled by staff requires a staff cancellation notice.
      if (event.cancelledBy !== 'staff') {
        return null;
      }
      return {
        userId: event.userId,
        template: NotificationTemplate.HOLD_CANCELLED_BY_STAFF,
        dedupeKey: `hold-cancelled:${event.holdId}`,
        validUntil: undefined,
        payload: {
          holdId: event.holdId,
          bookId: event.bookId,
          cancelledBy: event.cancelledBy,
          reason: event.reason,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.HOLD_EXPIRED: {
      // hold.expired is skipped because missed_pickup.recorded covers all hold expiry notifications
      return null;
    }

    case DOMAIN_EVENT_NAMES.MISSED_PICKUP_RECORDED: {
      if (event.excused) {
        return {
          userId: event.userId,
          template: NotificationTemplate.HOLD_EXPIRED_EXCUSED,
          dedupeKey: `hold-expired:${event.holdId}`,
          validUntil: undefined,
          payload: {
            holdId: event.holdId,
            bookId: event.bookId,
            excused: true,
            reason: event.reason,
          },
        };
      }

      return {
        userId: event.userId,
        template: NotificationTemplate.HOLD_EXPIRED_MISSED,
        dedupeKey: `hold-expired:${event.holdId}`,
        validUntil: undefined,
        payload: {
          holdId: event.holdId,
          bookId: event.bookId,
          unassessedCount: event.unassessedCount,
          threshold: event.threshold,
          excused: false,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.MISSED_PICKUP_FINE_ASSESSED: {
      return {
        userId: event.userId,
        template: NotificationTemplate.MISSED_PICKUP_FINE,
        dedupeKey: `missed-fine:${event.fineId}`,
        validUntil: undefined,
        payload: {
          fineId: event.fineId,
          amountMinor: event.amountMinor,
          holdIds: event.holdIds,
          missedPickupIds: event.missedPickupIds,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.LOAN_STARTED: {
      return {
        userId: event.userId,
        template: NotificationTemplate.LOAN_STARTED,
        dedupeKey: `loan-started:${event.loanId}`,
        validUntil: undefined,
        payload: {
          loanId: event.loanId,
          bookId: event.bookId,
          dueAt: event.dueAt,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.LOAN_DUE_SOON: {
      return {
        userId: event.userId,
        template: NotificationTemplate.LOAN_DUE_SOON,
        dedupeKey: `loan-due-soon:${event.loanId}`,
        validUntil: event.dueAt ? new Date(event.dueAt) : undefined,
        payload: {
          loanId: event.loanId,
          bookId: event.bookId,
          dueAt: event.dueAt,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.LOAN_OVERDUE: {
      return {
        userId: event.userId,
        template: NotificationTemplate.LOAN_OVERDUE,
        dedupeKey: `loan-overdue:${event.loanId}`,
        validUntil: undefined,
        payload: {
          loanId: event.loanId,
          bookId: event.bookId,
          dueAt: event.dueAt,
          daysLate: event.daysLate,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.LOAN_RETURNED: {
      // Only returns on time and in good condition get a return receipt.
      // Damaged or late returns are covered by the fine email.
      if (event.daysLate === 0 && event.condition === 'GOOD') {
        return {
          userId: event.userId,
          template: NotificationTemplate.RETURN_RECEIPT,
          dedupeKey: `return-receipt:${event.loanId}`,
          validUntil: undefined,
          payload: {
            loanId: event.loanId,
            bookId: event.bookId,
            condition: event.condition,
            returnedAt: event.returnedAt,
          },
        };
      }
      return null;
    }

    case DOMAIN_EVENT_NAMES.FINE_CREATED: {
      // MISSED_PICKUPS is covered by missed_pickup.fine_assessed
      if (event.reason === 'MISSED_PICKUPS') {
        return null;
      }
      return {
        userId: event.userId,
        template: NotificationTemplate.FINE_ASSESSED,
        dedupeKey: `fine-assessed:${event.fineId}`,
        validUntil: undefined,
        payload: {
          fineId: event.fineId,
          reason: event.reason,
          amountMinor: event.amountMinor,
          loanId: event.loanId,
          bookId: event.bookId,
          daysLate: event.daysLate,
        },
      };
    }

    case DOMAIN_EVENT_NAMES.FINE_SETTLED: {
      if (event.status === 'PAID') {
        return {
          userId: event.userId,
          template: NotificationTemplate.FINE_PAID,
          dedupeKey: `fine-settled:${event.fineId}`,
          validUntil: undefined,
          payload: {
            fineId: event.fineId,
            amountMinor: event.amountMinor,
            reason: event.reason,
          },
        };
      }

      if (event.status === 'WAIVED') {
        return {
          userId: event.userId,
          template: NotificationTemplate.FINE_WAIVED,
          dedupeKey: `fine-settled:${event.fineId}`,
          validUntil: undefined,
          payload: {
            fineId: event.fineId,
            amountMinor: event.amountMinor,
            reason: event.reason,
          },
        };
      }

      return null;
    }

    case DOMAIN_EVENT_NAMES.USER_REGISTERED: {
      return {
        userId: event.userId,
        template: NotificationTemplate.WELCOME,
        dedupeKey: `welcome:${event.userId}`,
        validUntil: undefined,
        payload: {
          userId: event.userId,
          email: event.email,
          name: event.name,
        },
      };
    }

    default:
      return null;
  }
}
