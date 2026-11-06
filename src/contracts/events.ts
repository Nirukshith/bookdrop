import {
  CopyStatus,
  FineReason,
  FineStatus,
  ReservationCancelReason,
  ReturnCondition,
} from '@prisma/client';

export type CancelledBy = 'member' | 'staff';
export type LoanSource = 'PICKUP' | 'WALK_IN';

export const DOMAIN_EVENT_NAMES = {
  HOLD_CREATED: 'hold.created',
  HOLD_CANCELLED: 'hold.cancelled',
  HOLD_EXPIRED: 'hold.expired',
  HOLD_FULFILLED: 'hold.fulfilled',
  LOAN_STARTED: 'loan.started',
  LOAN_RETURNED: 'loan.returned',
  LOAN_LOST: 'loan.lost',
  COPY_CREATED: 'copy.created',
  COPY_STATUS_CHANGED: 'copy.status_changed',
  COPY_RETIRED: 'copy.retired',
  FINE_CREATED: 'fine.created',
  FINE_PAYMENT_RECORDED: 'fine.payment_recorded',
  FINE_SETTLED: 'fine.settled',
  BOOK_PRICE_CHANGED: 'book.price_changed',
  RESERVATION_JOINED: 'reservation.joined',
  RESERVATION_CANCELLED: 'reservation.cancelled',
  RESERVATION_PROMOTED: 'reservation.promoted',
  MISSED_PICKUP_RECORDED: 'missed_pickup.recorded',
  MISSED_PICKUP_FINE_ASSESSED: 'missed_pickup.fine_assessed',
  LOAN_DUE_SOON: 'loan.due_soon',
  LOAN_OVERDUE: 'loan.overdue',
  HOLD_EXPIRING_SOON: 'hold.expiring_soon',
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENT_NAMES)[keyof typeof DOMAIN_EVENT_NAMES];

export interface HoldCreatedPayload {
  holdId: number;
  userId: number;
  bookId: number;
  copyId: number;
  expiresAt: Date;
  createdAt?: Date;
}

export interface HoldCancelledPayload {
  holdId: number;
  cancelledBy: CancelledBy;
  reason?: string | null;
  userId?: number;
  bookId?: number;
  copyId?: number;
  cancelledById?: number;
  cancelledAt?: Date;
}

export interface HoldExpiredPayload {
  holdId: number;
  userId: number;
  bookId: number;
  copyId: number;
  expiredAt?: Date;
}

export interface HoldFulfilledPayload {
  holdId: number;
  loanId?: number;
  userId?: number;
  bookId?: number;
  copyId?: number;
  fulfilledAt?: Date;
}

export interface LoanStartedPayload {
  loanId: number;
  userId: number;
  bookId: number;
  copyId: number;
  borrowedAt: Date;
  dueAt: Date;
  source: LoanSource;
  occurredAt?: Date;
}

export interface LoanReturnedPayload {
  loanId: number;
  userId: number;
  bookId: number;
  copyId: number;
  returnedAt: Date;
  daysLate: number;
  condition: ReturnCondition;
  occurredAt?: Date;
}

export interface LoanLostPayload {
  loanId: number;
  userId: number;
  bookId: number;
  copyId: number;
  occurredAt?: Date;
}

export interface FineCreatedPayload {
  fineId: number;
  userId: number;
  reason: FineReason;
  amountMinor: number;
  loanId?: number | null;
  occurredAt?: Date;
}

export interface CopyCreatedPayload {
  copyId: number;
  bookId: number;
  barcode: string;
  status: CopyStatus;
  shelfLocation?: string | null;
  actorId?: number | null;
  occurredAt?: Date;
}

export interface CopyStatusChangedPayload {
  copyId: number;
  bookId: number;
  fromStatus: CopyStatus;
  toStatus: CopyStatus;
  reason?: string | null;
  actorId?: number | null;
  occurredAt?: Date;
}

export interface CopyRetiredPayload {
  copyId: number;
  bookId: number;
  reason: string;
  retiredAt?: Date;
  actorId?: number | null;
  occurredAt?: Date;
}

export interface FinePaymentRecordedPayload {
  eventName?: string;
  domain?: string;
  fineId: number;
  paymentId: number;
  userId: number;
  amountMinor: number;
  paidMinor: number;
  remainingMinor: number;
  receivedById: number;
  occurredAt?: Date;
}

export interface FineSettledPayload {
  eventName?: string;
  domain?: string;
  fineId: number;
  userId: number;
  reason: FineReason;
  status: FineStatus;
  settledAt: Date;
  occurredAt?: Date;
}

export interface BookPriceChangedPayload {
  eventName?: string;
  domain?: string;
  bookId: number;
  oldPriceMinor?: number | null;
  newPriceMinor?: number | null;
  from?: number | null;
  to?: number | null;
  actorId?: number | null;
  occurredAt?: Date;
}

export interface ReservationJoinedPayload {
  eventName?: string;
  domain?: string;
  reservationId: number;
  userId: number;
  bookId: number;
  position: number;
  occurredAt?: Date;
}

export interface ReservationCancelledPayload {
  eventName?: string;
  domain?: string;
  reservationId: number;
  userId: number;
  bookId: number;
  reason: ReservationCancelReason | string;
  cancelledById?: number | null;
  occurredAt?: Date;
}

export interface ReservationPromotedPayload {
  eventName?: string;
  domain?: string;
  reservationId: number;
  userId: number;
  bookId: number;
  holdId: number;
  copyId: number;
  occurredAt?: Date;
}

export interface MissedPickupRecordedPayload {
  eventName?: string;
  domain?: string;
  userId: number;
  holdId: number;
  bookId?: number;
  missedAt?: Date;
  excused: boolean;
  reason?: string | null;
  unassessedCount: number;
  threshold: number;
  occurredAt?: Date;
}

export interface MissedPickupFineAssessedPayload {
  eventName?: string;
  domain?: string;
  userId: number;
  fineId: number;
  holdIds: number[];
  missedPickupIds?: number[];
  amountMinor: number;
  occurredAt?: Date;
}

export interface LoanDueSoonPayload {
  eventName?: string;
  domain?: string;
  loanId: number;
  userId: number;
  bookId: number;
  dueAt: Date;
  occurredAt?: Date;
}

export interface LoanOverduePayload {
  eventName?: string;
  domain?: string;
  loanId: number;
  userId: number;
  bookId: number;
  dueAt: Date;
  daysLate: number;
  occurredAt?: Date;
}

export interface HoldExpiringSoonPayload {
  eventName?: string;
  domain?: string;
  holdId: number;
  userId: number;
  bookId: number;
  expiresAt: Date;
  occurredAt?: Date;
}
