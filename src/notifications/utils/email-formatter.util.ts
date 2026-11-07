import { DateTime } from 'luxon';
import { DEFAULT_LIBRARY_TIMEZONE, formatRs } from '../../config/library-rules';

/**
 * Formats a date instant into the library's local timezone:
 * e.g. "Fri 7 Nov, 5:00 PM"
 */
export function formatDateTime(
  date: Date | string | number,
  timezone: string = DEFAULT_LIBRARY_TIMEZONE,
): string {
  if (!date) {
    return '';
  }
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    return '';
  }
  const local = DateTime.fromJSDate(d, { zone: timezone });
  if (!local.isValid) {
    return d.toISOString();
  }
  return local.toFormat('ccc d LLL, h:mm a');
}

/**
 * Formats minor units (paise) into a human-readable Rupee string:
 * e.g. 10000 -> "Rs 100.00"
 */
export function formatEmailMoney(minorUnits: number): string {
  return formatRs(minorUnits, 'Rs ');
}

/**
 * Escapes HTML characters in user-supplied strings to prevent XSS injection in HTML emails:
 * e.g. "<script>alert(1)</script>" -> "&lt;script&gt;alert(1)&lt;/script&gt;"
 */
export function escapeHtml(text: string): string {
  if (!text) {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes email subjects by stripping CRLF characters (\r and \n)
 * to prevent SMTP email header injection attacks.
 */
export function sanitizeSubject(subject: string): string {
  if (!subject) {
    return '';
  }
  return subject
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Masks an email address for privacy-safe audit logging:
 * e.g. "john.doe@example.com" -> "j***@example.com"
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '***';
  }
  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return '***';
  }
  const username = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (username.length <= 1) {
    return `${username}***${domain}`;
  }
  return `${username[0]}***${domain}`;
}
