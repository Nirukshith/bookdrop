import { CopyStatus } from '@prisma/client';

export type CancelledBy = 'member' | 'staff';

export const DOMAIN_EVENT_NAMES = {
  HOLD_CREATED: 'hold.created',
  HOLD_CANCELLED: 'hold.cancelled',
  HOLD_EXPIRED: 'hold.expired',
  HOLD_FULFILLED: 'hold.fulfilled',
  COPY_CREATED: 'copy.created',
  COPY_STATUS_CHANGED: 'copy.status_changed',
  COPY_RETIRED: 'copy.retired',
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
  userId: number;
  bookId: number;
  copyId: number;
  fulfilledAt?: Date;
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
