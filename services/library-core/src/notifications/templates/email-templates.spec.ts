import { NotificationTemplate } from '../notification.types';
import { renderEmail } from './email-templates';

describe('Email Templates (Unit Tests)', () => {
  const expiresAt = new Date('2026-11-06T11:30:00.000Z');
  const dueAt = new Date('2026-11-20T18:29:59.000Z');
  const returnedAt = new Date('2026-11-20T10:00:00.000Z');

  describe('Security & XSS Escaping', () => {
    it('escapes script tags in book titles and patron names in HTML while leaving text clean', () => {
      const result = renderEmail(NotificationTemplate.HOLD_CONFIRMED, {
        recipientName: '<script>alert("hacker")</script>',
        recipientEmail: 'patron@example.com',
        bookTitle: '<img src=x onerror=alert(1)>',
        expiresAt,
        timezone: 'Asia/Colombo',
      });

      expect(result.html).toContain(
        '&lt;script&gt;alert(&quot;hacker&quot;)&lt;/script&gt;',
      );
      expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(result.html).not.toContain('<script>');
      expect(result.text).toContain('<img src=x onerror=alert(1)>');
    });

    it('sanitizes subject lines by stripping newlines and CRLF injections', () => {
      const result = renderEmail(NotificationTemplate.LOAN_OVERDUE, {
        recipientName: 'Alice',
        recipientEmail: 'alice@example.com',
        bookTitle: 'Normal Book\r\nBcc: evil@phishing.com\nSubject: Spoofed',
        dueAt,
        daysLate: 2,
      });

      expect(result.subject).not.toContain('\r');
      expect(result.subject).not.toContain('\n');
      expect(result.subject).toBe(
        'Overdue Notice: Normal Book Bcc: evil@phishing.com Subject: Spoofed',
      );
    });
  });

  describe('All 15 Templates Rendering', () => {
    it('renders HOLD_CONFIRMED with local deadline', () => {
      const result = renderEmail(NotificationTemplate.HOLD_CONFIRMED, {
        recipientName: 'Bob',
        recipientEmail: 'bob@example.com',
        bookTitle: 'Clean Architecture',
        expiresAt,
        timezone: 'Asia/Colombo',
      });

      expect(result.subject).toBe('Hold Confirmed: Clean Architecture');
      expect(result.html).toContain('Clean Architecture');
      expect(result.html).toContain('Fri 6 Nov, 5:00 PM');
      expect(result.text).toContain('Clean Architecture');
    });

    it('renders RESERVATION_READY with local deadline', () => {
      const result = renderEmail(NotificationTemplate.RESERVATION_READY, {
        recipientName: 'Bob',
        recipientEmail: 'bob@example.com',
        bookTitle: 'Domain-Driven Design',
        expiresAt,
        timezone: 'UTC',
      });

      expect(result.subject).toBe(
        'Your Reserved Book is Ready: Domain-Driven Design',
      );
      expect(result.html).toContain('waiting reservation');
      expect(result.html).toContain('Fri 6 Nov, 11:30 AM');
    });

    it('renders HOLD_EXPIRING_SOON', () => {
      const result = renderEmail(NotificationTemplate.HOLD_EXPIRING_SOON, {
        recipientName: 'Charlie',
        recipientEmail: 'charlie@example.com',
        bookTitle: 'Refactoring',
        expiresAt,
        timezone: 'UTC',
      });

      expect(result.subject).toBe(
        'Reminder: Your Hold for Refactoring Expires Soon',
      );
      expect(result.html).toContain(
        'expires on <strong>Fri 6 Nov, 11:30 AM</strong>',
      );
    });

    it('renders HOLD_CANCELLED_BY_STAFF with reason', () => {
      const result = renderEmail(NotificationTemplate.HOLD_CANCELLED_BY_STAFF, {
        recipientName: 'David',
        recipientEmail: 'david@example.com',
        bookTitle: 'Design Patterns',
        reason: 'Copy damaged by flood',
      });

      expect(result.subject).toBe('Hold Cancelled: Design Patterns');
      expect(result.html).toContain('Reason: Copy damaged by flood');
      expect(result.text).toContain('Reason: Copy damaged by flood');
    });

    it('renders HOLD_EXPIRED_MISSED with strike count', () => {
      const result = renderEmail(NotificationTemplate.HOLD_EXPIRED_MISSED, {
        recipientName: 'Eve',
        recipientEmail: 'eve@example.com',
        bookTitle: 'The Mythical Man-Month',
        unassessedCount: 2,
        threshold: 3,
      });

      expect(result.subject).toBe('Hold Expired: The Mythical Man-Month');
      expect(result.html).toContain('2 of 3');
      expect(result.html).toContain('penalty fine of Rs 100');
    });

    it('renders HOLD_EXPIRED_EXCUSED with excuse notice', () => {
      const result = renderEmail(NotificationTemplate.HOLD_EXPIRED_EXCUSED, {
        recipientName: 'Frank',
        recipientEmail: 'frank@example.com',
        bookTitle: 'Code Complete',
        excusedReason: 'system maintenance delay',
      });

      expect(result.subject).toBe('Hold Expired: Code Complete');
      expect(result.html).toContain('excused');
      expect(result.html).toContain(
        'will not count toward your fine threshold',
      );
    });

    it('renders MISSED_PICKUP_FINE with Rs 100.00 fine notice', () => {
      const result = renderEmail(NotificationTemplate.MISSED_PICKUP_FINE, {
        recipientName: 'Grace',
        recipientEmail: 'grace@example.com',
        amountMinor: 10000,
      });

      expect(result.subject).toBe('Fine Assessed: Missed Pickups Penalty');
      expect(result.html).toContain('Rs 100.00');
      expect(result.html).toContain('3 unassessed missed pickups');
    });

    it('renders LOAN_STARTED with due date', () => {
      const result = renderEmail(NotificationTemplate.LOAN_STARTED, {
        recipientName: 'Hank',
        recipientEmail: 'hank@example.com',
        bookTitle: 'Pragmatic Programmer',
        dueAt,
        timezone: 'UTC',
      });

      expect(result.subject).toBe('Loan Started: Pragmatic Programmer');
      expect(result.html).toContain('Fri 20 Nov, 6:29 PM');
    });

    it('renders LOAN_DUE_SOON with due date', () => {
      const result = renderEmail(NotificationTemplate.LOAN_DUE_SOON, {
        recipientName: 'Hank',
        recipientEmail: 'hank@example.com',
        bookTitle: 'Pragmatic Programmer',
        dueAt,
        timezone: 'UTC',
      });

      expect(result.subject).toBe('Reminder: Pragmatic Programmer is Due Soon');
      expect(result.html).toContain('Fri 20 Nov, 6:29 PM');
    });

    it('renders LOAN_OVERDUE with days late and late fee rate', () => {
      const result = renderEmail(NotificationTemplate.LOAN_OVERDUE, {
        recipientName: 'Ivy',
        recipientEmail: 'ivy@example.com',
        bookTitle: 'Introduction to Algorithms',
        dueAt,
        daysLate: 5,
        timezone: 'UTC',
      });

      expect(result.subject).toBe('Overdue Notice: Introduction to Algorithms');
      expect(result.html).toContain('5 day(s) overdue');
      expect(result.html).toContain('Rs 10 per day');
    });

    it('renders RETURN_RECEIPT with good condition notice', () => {
      const result = renderEmail(NotificationTemplate.RETURN_RECEIPT, {
        recipientName: 'Jack',
        recipientEmail: 'jack@example.com',
        bookTitle: 'Structure and Interpretation of Computer Programs',
        returnedAt,
        condition: 'GOOD',
        timezone: 'UTC',
      });

      expect(result.subject).toBe(
        'Return Receipt: Structure and Interpretation of Computer Programs',
      );
      expect(result.html).toContain('Condition: Good');
      expect(result.html).toContain('Fri 20 Nov, 10:00 AM');
    });

    it('renders FINE_ASSESSED with amount and reason', () => {
      const result = renderEmail(NotificationTemplate.FINE_ASSESSED, {
        recipientName: 'Karen',
        recipientEmail: 'karen@example.com',
        bookTitle: 'Operating Systems',
        amountMinor: 3000,
        reason: 'LATE_RETURN',
        daysLate: 3,
      });

      expect(result.subject).toBe('Fine Notice: LATE_RETURN');
      expect(result.html).toContain('Rs 30.00');
      expect(result.html).toContain('Operating Systems');
      expect(result.html).toContain('3 days late');
    });

    it('renders FINE_PAID with receipt confirmation', () => {
      const result = renderEmail(NotificationTemplate.FINE_PAID, {
        recipientName: 'Leo',
        recipientEmail: 'leo@example.com',
        amountMinor: 3000,
      });

      expect(result.subject).toBe('Payment Receipt: Fine Settled');
      expect(result.html).toContain('Rs 30.00');
      expect(result.html).toContain('PAID');
    });

    it('renders FINE_WAIVED with staff waiver notice', () => {
      const result = renderEmail(NotificationTemplate.FINE_WAIVED, {
        recipientName: 'Mona',
        recipientEmail: 'mona@example.com',
        amountMinor: 5000,
      });

      expect(result.subject).toBe('Fine Waived by Library');
      expect(result.html).toContain('WAIVED');
      expect(result.html).toContain('Rs 50.00');
    });

    it('renders WELCOME on patron registration', () => {
      const result = renderEmail(NotificationTemplate.WELCOME, {
        recipientName: 'Nina',
        recipientEmail: 'nina@example.com',
      });

      expect(result.subject).toBe('Welcome to Bookdrop!');
      expect(result.html).toContain('Welcome to <strong>Bookdrop</strong>');
      expect(result.text).toContain('Welcome to Bookdrop!');
    });
  });
});
