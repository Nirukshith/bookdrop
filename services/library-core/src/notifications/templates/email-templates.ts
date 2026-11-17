import { NotificationTemplate } from '../notification.types';
import {
  escapeHtml,
  formatDateTime,
  formatEmailMoney,
  sanitizeSubject,
} from '../utils/email-formatter.util';
import { DEFAULT_LIBRARY_TIMEZONE } from '../../config/library-rules';

export interface EmailTemplateContext {
  recipientName: string;
  recipientEmail: string;
  bookTitle?: string;
  expiresAt?: Date;
  dueAt?: Date;
  returnedAt?: Date;
  daysLate?: number;
  condition?: string;
  amountMinor?: number;
  reason?: string;
  unassessedCount?: number;
  threshold?: number;
  excused?: boolean;
  excusedReason?: string;
  timezone?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Pure template renderer implementing all 15 Bookdrop notification templates:
 * - HTML-escapes all user-controlled text (titles, patron names, reasons)
 * - Sanitizes subject lines by stripping newlines
 * - Formats dates and times in the library's IANA timezone
 * - Formats money from integer minor units
 */
export function renderEmail(
  template: NotificationTemplate,
  ctx: EmailTemplateContext,
): RenderedEmail {
  const tz = ctx.timezone || DEFAULT_LIBRARY_TIMEZONE;
  const nameSafe = escapeHtml(ctx.recipientName || 'Patron');
  const titleSafe = escapeHtml(ctx.bookTitle || 'Book');
  const rawTitle = ctx.bookTitle || 'Book';

  switch (template) {
    case NotificationTemplate.HOLD_CONFIRMED: {
      const deadlineStr = ctx.expiresAt
        ? formatDateTime(ctx.expiresAt, tz)
        : 'N/A';
      const subject = sanitizeSubject(`Hold Confirmed: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Your remote hold request for <strong>${titleSafe}</strong> has been confirmed.</p>
          <p>Please collect your copy from the library pickup desk before: <strong>${deadlineStr}</strong>.</p>
          <p>Thank you for using Bookdrop!</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYour hold request for "${rawTitle}" has been confirmed.\nPlease collect your copy before: ${deadlineStr}.\n\nThank you for using Bookdrop!`,
      };
    }

    case NotificationTemplate.RESERVATION_READY: {
      const deadlineStr = ctx.expiresAt
        ? formatDateTime(ctx.expiresAt, tz)
        : 'N/A';
      const subject = sanitizeSubject(
        `Your Reserved Book is Ready: ${rawTitle}`,
      );
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Great news! Your waiting reservation for <strong>${titleSafe}</strong> is now ready for pickup.</p>
          <p>A copy has been set aside for you. Please collect it before: <strong>${deadlineStr}</strong>.</p>
          <p>Thank you for your patience!</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nGreat news! Your reservation for "${rawTitle}" is now ready for pickup.\nPlease collect it before: ${deadlineStr}.\n\nThank you for your patience!`,
      };
    }

    case NotificationTemplate.HOLD_EXPIRING_SOON: {
      const deadlineStr = ctx.expiresAt
        ? formatDateTime(ctx.expiresAt, tz)
        : 'soon';
      const subject = sanitizeSubject(
        `Reminder: Your Hold for ${rawTitle} Expires Soon`,
      );
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>This is a friendly reminder that your hold for <strong>${titleSafe}</strong> expires on <strong>${deadlineStr}</strong>.</p>
          <p>If not collected, the hold will expire and the copy will be offered to the next patron.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nThis is a friendly reminder that your hold for "${rawTitle}" expires on ${deadlineStr}.\nIf not collected, the copy will be offered to the next patron.`,
      };
    }

    case NotificationTemplate.HOLD_CANCELLED_BY_STAFF: {
      const reasonSafe = escapeHtml(ctx.reason || 'Administrative adjustment');
      const subject = sanitizeSubject(`Hold Cancelled: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Your hold for <strong>${titleSafe}</strong> has been cancelled by library staff.</p>
          <p>Reason: ${reasonSafe}</p>
          <p>Please contact the circulation desk if you have any questions.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYour hold for "${rawTitle}" has been cancelled by staff.\nReason: ${ctx.reason || 'Administrative adjustment'}\n\nPlease contact the circulation desk if you have questions.`,
      };
    }

    case NotificationTemplate.HOLD_EXPIRED_MISSED: {
      const count = ctx.unassessedCount ?? 1;
      const threshold = ctx.threshold ?? 3;
      const subject = sanitizeSubject(`Hold Expired: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Your pickup deadline for <strong>${titleSafe}</strong> has passed, and the hold has expired.</p>
          <p>You currently have <strong>${count} of ${threshold}</strong> unassessed missed pickups.</p>
          <p>Please note: Reaching ${threshold} missed pickups incurs a penalty fine of Rs 100.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYour hold for "${rawTitle}" has expired.\nYou have ${count} of ${threshold} unassessed missed pickups.\nReaching ${threshold} missed pickups incurs a Rs 100 penalty fine.`,
      };
    }

    case NotificationTemplate.HOLD_EXPIRED_EXCUSED: {
      const reasonSafe = escapeHtml(
        ctx.excusedReason || 'System processing delay',
      );
      const subject = sanitizeSubject(`Hold Expired: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Your hold for <strong>${titleSafe}</strong> has expired and the copy was released.</p>
          <p>Because this expiration was delayed by a ${reasonSafe}, this missed pickup has been <strong>excused</strong> and will not count toward your fine threshold.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYour hold for "${rawTitle}" has expired.\nBecause of a ${ctx.excusedReason || 'system delay'}, this missed pickup is excused and will not count toward your fine threshold.`,
      };
    }

    case NotificationTemplate.MISSED_PICKUP_FINE: {
      const amountStr = ctx.amountMinor
        ? formatEmailMoney(ctx.amountMinor)
        : 'Rs 100.00';
      const subject = sanitizeSubject('Fine Assessed: Missed Pickups Penalty');
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>You have accumulated 3 unassessed missed pickups for uncollected library holds.</p>
          <p>In accordance with library rules, a fine of <strong>${amountStr}</strong> has been assessed to your account.</p>
          <p>Please visit the circulation desk to clear your outstanding dues.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYou have reached 3 missed pickups.\nA fine of ${amountStr} has been assessed to your account.\nPlease visit the circulation desk to clear your outstanding dues.`,
      };
    }

    case NotificationTemplate.LOAN_STARTED: {
      const dueStr = ctx.dueAt ? formatDateTime(ctx.dueAt, tz) : 'N/A';
      const subject = sanitizeSubject(`Loan Started: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>You have successfully borrowed <strong>${titleSafe}</strong>.</p>
          <p>Please return this item on or before: <strong>${dueStr}</strong>.</p>
          <p>Enjoy your reading!</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYou have borrowed "${rawTitle}".\nDue date: ${dueStr}.\n\nEnjoy your reading!`,
      };
    }

    case NotificationTemplate.LOAN_DUE_SOON: {
      const dueStr = ctx.dueAt ? formatDateTime(ctx.dueAt, tz) : 'soon';
      const subject = sanitizeSubject(`Reminder: ${rawTitle} is Due Soon`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>This is a reminder that your loan for <strong>${titleSafe}</strong> is due on <strong>${dueStr}</strong>.</p>
          <p>Please return it on time to avoid late fees.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nReminder: Your loan for "${rawTitle}" is due on ${dueStr}.\nPlease return it on time to avoid late fees.`,
      };
    }

    case NotificationTemplate.LOAN_OVERDUE: {
      const dueStr = ctx.dueAt ? formatDateTime(ctx.dueAt, tz) : 'N/A';
      const days = ctx.daysLate ?? 1;
      const subject = sanitizeSubject(`Overdue Notice: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Your loan for <strong>${titleSafe}</strong> was due on ${dueStr} and is now <strong>${days} day(s) overdue</strong>.</p>
          <p>Late fees accrue at Rs 10 per day. Please return the book as soon as possible.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nOverdue Notice: Your loan for "${rawTitle}" is ${days} day(s) overdue.\nLate fees accrue at Rs 10/day. Please return the book as soon as possible.`,
      };
    }

    case NotificationTemplate.RETURN_RECEIPT: {
      const returnedStr = ctx.returnedAt
        ? formatDateTime(ctx.returnedAt, tz)
        : 'today';
      const subject = sanitizeSubject(`Return Receipt: ${rawTitle}`);
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Thank you for returning <strong>${titleSafe}</strong> on ${returnedStr}.</p>
          <p>Condition: Good. Your account has been updated with no outstanding fees for this loan.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nReturn Receipt: You returned "${rawTitle}" on ${returnedStr} in good condition.\nThank you!`,
      };
    }

    case NotificationTemplate.FINE_ASSESSED: {
      const amountStr = ctx.amountMinor
        ? formatEmailMoney(ctx.amountMinor)
        : 'Rs 0.00';
      const reasonStr = escapeHtml(ctx.reason || 'Circulation penalty');
      const subject = sanitizeSubject(
        `Fine Notice: ${ctx.reason || 'Fine Assessed'}`,
      );
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>A fine of <strong>${amountStr}</strong> has been assessed to your account.</p>
          <p>Reason: ${reasonStr}${ctx.daysLate ? ` (${ctx.daysLate} days late)` : ''}</p>
          <p>Book: ${titleSafe}</p>
          <p>Please pay your outstanding fine at the circulation desk.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nA fine of ${amountStr} has been assessed.\nReason: ${ctx.reason || 'Circulation penalty'}\nBook: ${rawTitle}\n\nPlease visit the circulation desk to pay your fine.`,
      };
    }

    case NotificationTemplate.FINE_PAID: {
      const amountStr = ctx.amountMinor
        ? formatEmailMoney(ctx.amountMinor)
        : 'paid in full';
      const subject = sanitizeSubject('Payment Receipt: Fine Settled');
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>We have received your payment of <strong>${amountStr}</strong>.</p>
          <p>Your fine has been marked as <strong>PAID</strong>. Thank you for clearing your balance!</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nPayment Receipt: We have received your payment of ${amountStr}.\nYour fine is settled in full. Thank you!`,
      };
    }

    case NotificationTemplate.FINE_WAIVED: {
      const amountStr = ctx.amountMinor
        ? formatEmailMoney(ctx.amountMinor)
        : '';
      const subject = sanitizeSubject('Fine Waived by Library');
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Your outstanding fine${amountStr ? ` of ${amountStr}` : ''} has been administratively <strong>WAIVED</strong> by library staff.</p>
          <p>Your account balance has been updated accordingly.</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nYour fine${amountStr ? ` of ${amountStr}` : ''} has been WAIVED by staff.\nYour account balance has been updated.`,
      };
    }

    case NotificationTemplate.WELCOME: {
      const subject = sanitizeSubject('Welcome to Bookdrop!');
      return {
        subject,
        html: `
          <p>Hello ${nameSafe},</p>
          <p>Welcome to <strong>Bookdrop</strong>!</p>
          <p>Your library account is active. You can now browse our catalog, place holds on physical copies, and join waiting queues.</p>
          <p>Happy reading!</p>
        `.trim(),
        text: `Hello ${ctx.recipientName},\n\nWelcome to Bookdrop!\nYour library account is active. You can now browse our catalog and borrow books.\n\nHappy reading!`,
      };
    }

    default: {
      const subject = sanitizeSubject(`Bookdrop Notification`);
      return {
        subject,
        html: `<p>Hello ${nameSafe},</p><p>You have a new notification from Bookdrop.</p>`,
        text: `Hello ${ctx.recipientName},\n\nYou have a new notification from Bookdrop.`,
      };
    }
  }
}
