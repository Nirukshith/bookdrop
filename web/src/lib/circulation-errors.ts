import type { ConfirmTone } from '@/components/ui/confirm-modal';
import { MAX_ACTIVE_HOLDS, MAX_ACTIVE_LOANS, MAX_ACTIVE_RESERVATIONS } from './library-rules';

/**
 * Friendly, member-facing wording for circulation errors, keyed by the stable
 * `extensions.code` the API returns. Used to show blocked actions (limits,
 * fines, overdue books...) in the shared warning modal instead of a banner the
 * user may have scrolled past.
 */
export interface CirculationNotice {
  code: string | null;
  title: string;
  message: string;
  tone: ConfirmTone;
  /** Dashboard tab where the member can resolve it, if any. */
  dashboardTab?: 'loans' | 'holds' | 'queue' | 'fines';
  actionLabel?: string;
}

export function errorCode(err: unknown): string | null {
  const e = err as { errors?: { extensions?: { code?: string } }[] } | null;
  return e?.errors?.[0]?.extensions?.code ?? null;
}

const NOTICES: Record<string, Omit<CirculationNotice, 'code'>> = {
  HOLD_LIMIT_REACHED: {
    title: 'Hold limit reached',
    message: `You can have up to ${MAX_ACTIVE_HOLDS} books on hold at a time. Pick up or cancel one of your holds to place a new one.`,
    tone: 'warning',
    dashboardTab: 'holds',
    actionLabel: 'View my holds',
  },
  LOAN_LIMIT_REACHED: {
    title: 'Borrowing limit reached',
    message: `You can borrow up to ${MAX_ACTIVE_LOANS} books at a time. Return one of your books before placing a new hold or borrowing another.`,
    tone: 'warning',
    dashboardTab: 'loans',
    actionLabel: 'View my loans',
  },
  QUEUE_LIMIT_REACHED: {
    title: 'Waitlist limit reached',
    message: `You can wait for up to ${MAX_ACTIVE_RESERVATIONS} books at a time. Leave one of your waitlists to join a new one.`,
    tone: 'warning',
    dashboardTab: 'queue',
    actionLabel: 'View my waitlists',
  },
  UNPAID_FINES: {
    title: 'Outstanding fines',
    message: 'You have unpaid fines on your account. Please settle them at the circulation desk to place holds, join waitlists or borrow again.',
    tone: 'warning',
    dashboardTab: 'fines',
    actionLabel: 'View my fines',
  },
  OVERDUE_LOANS: {
    title: 'You have an overdue book',
    message: 'Please return your overdue books first. Holds, waitlists and borrowing unlock again once nothing is overdue.',
    tone: 'warning',
    dashboardTab: 'loans',
    actionLabel: 'View my loans',
  },
  MEMBERSHIP_NOT_APPROVED: {
    title: 'Membership not approved yet',
    message: 'An admin needs to verify your membership number before you can place holds, join waitlists or borrow. We’ll email you once it’s approved.',
    tone: 'info',
  },
  ALREADY_HELD: {
    title: 'Already on hold',
    message: 'You already have this book on hold. Check your holds for the pickup deadline.',
    tone: 'info',
    dashboardTab: 'holds',
    actionLabel: 'View my holds',
  },
  ALREADY_QUEUED: {
    title: 'Already on the waitlist',
    message: 'You’re already waiting for this book. We’ll email you when a copy is ready.',
    tone: 'info',
    dashboardTab: 'queue',
    actionLabel: 'View my waitlists',
  },
  NO_COPY_AVAILABLE: {
    title: 'No copies left',
    message: 'The last available copy was just taken. You can join the waitlist instead.',
    tone: 'info',
  },
  COPY_AVAILABLE: {
    title: 'A copy is available',
    message: 'This book has a copy on the shelf right now, so you can place a hold instead of joining the waitlist.',
    tone: 'info',
  },
};

export function describeCirculationError(err: unknown, fallbackTitle: string): CirculationNotice {
  const code = errorCode(err);
  const known = code ? NOTICES[code] : undefined;
  if (known) return { code, ...known };
  return {
    code,
    title: fallbackTitle,
    message: (err as Error)?.message || 'Something went wrong. Please try again.',
    tone: 'danger',
  };
}

/** Same wording, addressed to staff at the desk (about "this member", not "you"). */
export function describeDeskError(err: unknown, fallbackTitle: string): CirculationNotice {
  const code = errorCode(err);
  const staff: Record<string, { title: string; message: string }> = {
    LOAN_LIMIT_REACHED: {
      title: 'Borrowing limit reached',
      message: `This member already has ${MAX_ACTIVE_LOANS} books on loan, the maximum. They need to return one before borrowing another.`,
    },
    UNPAID_FINES: {
      title: 'Member has unpaid fines',
      message: 'This member must settle their outstanding fines before they can borrow.',
    },
    OVERDUE_LOANS: {
      title: 'Member has an overdue book',
      message: 'This member must return their overdue books before they can borrow again.',
    },
    MEMBERSHIP_NOT_APPROVED: {
      title: 'Membership not approved',
      message: 'This member’s membership hasn’t been approved by an admin yet, so they can’t borrow.',
    },
  };
  const s = code ? staff[code] : undefined;
  if (s) return { code, ...s, tone: 'warning' };
  return {
    code,
    title: fallbackTitle,
    message: (err as Error)?.message || 'Something went wrong. Please try again.',
    tone: 'danger',
  };
}
