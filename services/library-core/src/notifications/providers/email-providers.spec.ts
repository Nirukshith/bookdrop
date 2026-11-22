import { ConsoleEmailProvider } from './console-email.provider';
import { FakeEmailProvider } from './fake-email.provider';
import { SesEmailProvider } from './ses-email.provider';
import { SmtpEmailProvider } from './smtp-email.provider';
import {
  PermanentEmailError,
  TransientEmailError,
} from './email-provider.interface';

describe('Email Providers (Unit Tests)', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('ConsoleEmailProvider', () => {
    it('returns a mock message ID and logs masked email preview', async () => {
      const provider = new ConsoleEmailProvider();
      const result = await provider.sendEmail({
        to: 'patron@example.com',
        subject: 'Hold Confirmed',
        html: '<p>Confirmed</p>',
        text: 'Confirmed',
      });

      expect(result.messageId).toMatch(/^console-\d+-[a-z0-9]+$/);
    });
  });

  describe('FakeEmailProvider', () => {
    it('records sent emails and can be cleared', async () => {
      const fake = new FakeEmailProvider();
      expect(fake.getSentEmails()).toHaveLength(0);

      await fake.sendEmail({
        to: 'alice@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(fake.getSentEmails()).toHaveLength(1);
      expect(fake.getSentEmails()[0].to).toBe('alice@example.com');
      expect(fake.getSentEmails()[0].messageId).toMatch(/^fake-/);

      fake.clear();
      expect(fake.getSentEmails()).toHaveLength(0);
    });

    it('simulates one-shot next failure', async () => {
      const fake = new FakeEmailProvider();
      fake.simulateNextFailure(new TransientEmailError('Temporary outage'));

      await expect(
        fake.sendEmail({
          to: 'bob@example.com',
          subject: 'Test',
          html: 'p',
          text: 'p',
        }),
      ).rejects.toThrow(TransientEmailError);

      // Next call succeeds normally
      const res = await fake.sendEmail({
        to: 'bob@example.com',
        subject: 'Test',
        html: 'p',
        text: 'p',
      });
      expect(res.messageId).toBeDefined();
    });

    it('simulates persistent failure until cleared', async () => {
      const fake = new FakeEmailProvider();
      fake.simulateFailure(new PermanentEmailError('Invalid address'));

      await expect(
        fake.sendEmail({
          to: 'bad@example.com',
          subject: 'Test',
          html: 'p',
          text: 'p',
        }),
      ).rejects.toThrow(PermanentEmailError);

      fake.clear();
      const res = await fake.sendEmail({
        to: 'good@example.com',
        subject: 'Test',
        html: 'p',
        text: 'p',
      });
      expect(res.messageId).toBeDefined();
    });
  });

  describe('SesEmailProvider Safety Rules', () => {
    it('strictly refuses to instantiate when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      expect(() => new SesEmailProvider()).toThrow(
        /Safety violation: SesEmailProvider is strictly forbidden from starting when NODE_ENV is not 'production'/,
      );

      process.env.NODE_ENV = 'test';
      expect(() => new SesEmailProvider()).toThrow(
        /Safety violation: SesEmailProvider is strictly forbidden from starting when NODE_ENV is not 'production'/,
      );
    });

    it('requires EMAIL_FROM and SES_REGION in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.EMAIL_FROM;
      delete process.env.SES_REGION;

      expect(() => new SesEmailProvider()).toThrow(
        /EMAIL_FROM and SES_REGION are strictly required in production/,
      );
    });

    it('classifies SES errors into transient and permanent', async () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_FROM = 'noreply@bookdrop.io';
      process.env.SES_REGION = 'ap-south-1';

      const mockSesClient = {
        send: jest.fn(),
      } as any;

      const provider = new SesEmailProvider({
        client: mockSesClient,
        from: 'noreply@bookdrop.io',
        region: 'ap-south-1',
      });

      // ThrottlingException -> Transient
      mockSesClient.send.mockRejectedValueOnce({
        name: 'ThrottlingException',
        message: 'Rate exceeded',
      });
      await expect(
        provider.sendEmail({
          to: 'user@example.com',
          subject: 'Test',
          html: '',
          text: '',
        }),
      ).rejects.toThrow(TransientEmailError);

      // MessageRejected -> Permanent
      mockSesClient.send.mockRejectedValueOnce({
        name: 'MessageRejected',
        message: 'Email address is not verified',
      });
      await expect(
        provider.sendEmail({
          to: 'unverified@example.com',
          subject: 'Test',
          html: '',
          text: '',
        }),
      ).rejects.toThrow(PermanentEmailError);
    });
  });

  describe('SmtpEmailProvider', () => {
    it('classifies 4xx and connection errors as transient, 5xx as permanent', async () => {
      const provider = new SmtpEmailProvider({
        host: 'localhost',
        port: 1025,
        from: 'noreply@bookdrop.io',
      });

      const mockTransporter = (provider as any).transporter;
      jest.spyOn(mockTransporter, 'sendMail').mockRejectedValueOnce({
        responseCode: 421,
        message: 'Service not available, closing transmission channel',
      });

      await expect(
        provider.sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          html: '',
          text: '',
        }),
      ).rejects.toThrow(TransientEmailError);

      jest.spyOn(mockTransporter, 'sendMail').mockRejectedValueOnce({
        responseCode: 550,
        message: 'Requested action not taken: mailbox unavailable',
      });

      await expect(
        provider.sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          html: '',
          text: '',
        }),
      ).rejects.toThrow(PermanentEmailError);
    });
  });
});
