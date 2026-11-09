import {
  escapeHtml,
  formatDateTime,
  formatEmailMoney,
  maskEmail,
  sanitizeSubject,
} from './email-formatter.util';

describe('Email Formatter Utilities (Pure Logic Unit Tests)', () => {
  describe('formatDateTime', () => {
    it('formats a date in UTC as "ccc d LLL, h:mm a"', () => {
      // 2026-11-06T11:30:00.000Z was Friday 11:30 AM UTC
      const date = new Date('2026-11-06T11:30:00.000Z');
      const formatted = formatDateTime(date, 'UTC');
      expect(formatted).toBe('Fri 6 Nov, 11:30 AM');
    });

    it('formats a date in Asia/Colombo timezone (+05:30)', () => {
      // 2026-11-06T11:30:00.000Z + 5:30 = 2026-11-06 17:00 (5:00 PM)
      const date = new Date('2026-11-06T11:30:00.000Z');
      const formatted = formatDateTime(date, 'Asia/Colombo');
      expect(formatted).toBe('Fri 6 Nov, 5:00 PM');
    });

    it('handles empty or invalid dates gracefully', () => {
      expect(formatDateTime(null as any)).toBe('');
      expect(formatDateTime(new Date('invalid-date'))).toBe('');
    });
  });

  describe('formatEmailMoney', () => {
    it('formats integer minor units into Rs currency string', () => {
      expect(formatEmailMoney(10000)).toBe('Rs 100.00');
      expect(formatEmailMoney(1550)).toBe('Rs 15.50');
      expect(formatEmailMoney(0)).toBe('Rs 0.00');
    });
  });

  describe('escapeHtml', () => {
    it('escapes dangerous HTML/XSS injection tags', () => {
      const malicious = '<script>alert(1)</script>';
      expect(escapeHtml(malicious)).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    });

    it('escapes quotes, ampersands, and angle brackets in book titles', () => {
      const input = `Harry Potter & the "Half-Blood" Prince <Edition>`;
      expect(escapeHtml(input)).toBe(
        'Harry Potter &amp; the &quot;Half-Blood&quot; Prince &lt;Edition&gt;',
      );
    });

    it('handles null and empty strings safely', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as any)).toBe('');
    });
  });

  describe('sanitizeSubject', () => {
    it('strips newlines and carriage returns from subjects', () => {
      const injection =
        'Reminder: Overdue\r\nBcc: victim@example.com\n\nMalicious body';
      const clean = sanitizeSubject(injection);
      expect(clean).toBe(
        'Reminder: Overdue Bcc: victim@example.com Malicious body',
      );
      expect(clean).not.toContain('\r');
      expect(clean).not.toContain('\n');
    });

    it('collapses multiple whitespace spaces and trims', () => {
      expect(sanitizeSubject('   Loan   Due   Soon   ')).toBe('Loan Due Soon');
    });

    it('handles empty subject safely', () => {
      expect(sanitizeSubject('')).toBe('');
      expect(sanitizeSubject(null as any)).toBe('');
    });
  });

  describe('maskEmail', () => {
    it('masks normal email address keeping first letter and domain', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
      expect(maskEmail('patron@library.org')).toBe('p***@library.org');
    });

    it('handles single-character username safely', () => {
      expect(maskEmail('a@test.com')).toBe('a***@test.com');
    });

    it('handles invalid email strings safely', () => {
      expect(maskEmail('invalid-email')).toBe('***');
      expect(maskEmail('')).toBe('***');
      expect(maskEmail(null as any)).toBe('***');
    });
  });
});
