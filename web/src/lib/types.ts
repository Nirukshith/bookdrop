export type Role = 'ADMIN' | 'LIBRARIAN' | 'MEMBER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Author {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface CopyCounts {
  available: number;
  borrowed: number;
  damaged: number;
  lost: number;
  onHold: number;
  total: number;
}

export type CopyStatus = 'AVAILABLE' | 'BORROWED' | 'DAMAGED' | 'LOST' | 'ON_HOLD';

export interface Copy {
  id: string;
  bookId: number;
  barcode: string;
  shelfLocation?: string | null;
  status: CopyStatus;
  notes?: string | null;
  retiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  title: string;
  isbn: string;
  publishedYear?: number | null;
  description?: string | null;
  replacementPriceRs?: number | null;
  authors: Author[];
  categories: Category[];
  availableCopies: number;
  availableCopiesCount: number;
  copyCounts?: CopyCounts;
  queueLength: number;
  createdAt: string;
}

export type HoldStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'FULFILLED';
export type HoldSource = 'ONLINE' | 'ADMIN' | 'PROMOTED_FROM_RESERVATION';

export interface Hold {
  id: string;
  userId: number;
  bookId: number;
  copyId: number;
  bookTitle: string;
  copyBarcode?: string | null;
  status: HoldStatus;
  source: string;
  expiresAt: string;
  resolvedAt?: string | null;
  resolvedNote?: string | null;
  createdAt: string;
}

export interface PickupDeskHold {
  id: string;
  userId: number;
  memberName: string;
  bookId: number;
  bookTitle: string;
  copyId: number;
  copyBarcode: string;
  pickupDeadline: string;
  createdAt: string;
}

export type LoanStatus = 'ACTIVE' | 'RETURNED' | 'LOST';
export type ReturnCondition = 'GOOD' | 'DAMAGED';

export interface Loan {
  id: string;
  userId: number;
  bookId: number;
  bookTitle: string;
  copyId: number;
  copyBarcode?: string | null;
  borrowedAt: string;
  dueAt: string;
  returnedAt?: string | null;
  status: LoanStatus;
  daysRemaining: number;
  daysLate: number;
  isOverdue: boolean;
  accruedLateFeeRs: number;
  returnCondition?: ReturnCondition | null;
  conditionNote?: string | null;
  notes?: string | null;
  createdAt: string;
}

export type ReservationStatus =
  | 'WAITING'
  | 'PROMOTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FULFILLED';

export interface Reservation {
  id: string;
  bookId: number;
  book?: Book | null;
  status: ReservationStatus;
  position?: number | null;
  createdAt: string;
  promotedAt?: string | null;
  holdId?: number | null;
  user?: User | null;
}

export type FineStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'WAIVED';
export type FineReason = 'OVERDUE' | 'DAMAGE' | 'LOST_BOOK' | 'MISSED_PICKUP';

export interface FinePayment {
  id: string;
  fineId: number;
  amountRs: number;
  receivedById: number;
  note?: string | null;
  createdAt: string;
}

export interface MyFine {
  id: string;
  bookTitle?: string | null;
  amountRs?: number | null;
  originalAmountRs: number;
  paidAmountRs: number;
  outstandingAmountRs: number;
  status: FineStatus;
  reason: FineReason;
  capRs?: number | null;
  createdAt?: string | null;
}

export interface Fine {
  id: string;
  loanId?: number | null;
  amountRs: number;
  paidRs: number;
  outstandingRs: number;
  status: FineStatus;
  reason: FineReason;
  capRs?: number | null;
  note?: string | null;
  daysLate?: number | null;
  createdAt: string;
}

export type NotificationStatus =
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export interface Notification {
  id: string;
  template: string;
  status: NotificationStatus;
  sentAt?: string | null;
  createdAt: string;
}

export interface JobStatus {
  name: string;
  isLeased: boolean;
  lockedBy?: string | null;
  lockedUntil?: string | null;
  lastStartedAt?: string | null;
  lastFinishedAt?: string | null;
  lastStatus?: string | null;
  lastStats?: string | null;
  lastError?: string | null;
}

export interface JobRunResult {
  jobName: string;
  success: boolean;
  durationMs: number;
  stats?: string | null;
  error?: string | null;
}

export interface MissedPickupsSummary {
  unassessedCount: number;
  threshold: number;
  recent: Array<{
    holdId: number;
    bookTitle: string;
    expiredAt: string;
  }>;
}

