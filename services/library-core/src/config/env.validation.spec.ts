import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://bookdrop:bookdrop@localhost:5432/bookdrop',
    JWT_ACCESS_SECRET:
      'this-is-a-long-and-secure-random-jwt-access-secret-32-chars',
  };

  it('validates a complete and valid configuration', () => {
    const { error, value } = envValidationSchema.validate(validConfig);
    expect(error).toBeUndefined();
    expect(value.JWT_ACCESS_TTL).toBe('15m');
    expect(value.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(value.PORT).toBe(3000);
    expect(value.NODE_ENV).toBe('development');
    expect(value.TRUST_PROXY).toBe(false);
    expect(value.ALLOWED_ORIGINS).toBe('');
    expect(value.SCHEDULER_ENABLED).toBe(false);
  });

  it('parses SCHEDULER_ENABLED=true correctly', () => {
    const { error, value } = envValidationSchema.validate({
      ...validConfig,
      SCHEDULER_ENABLED: true,
    });
    expect(error).toBeUndefined();
    expect(value.SCHEDULER_ENABLED).toBe(true);
  });

  it('parses custom TRUST_PROXY and ALLOWED_ORIGINS correctly', () => {
    const { error, value } = envValidationSchema.validate({
      ...validConfig,
      TRUST_PROXY: true,
      ALLOWED_ORIGINS: 'https://example.com,https://app.bookdrop.io',
    });
    expect(error).toBeUndefined();
    expect(value.TRUST_PROXY).toBe(true);
    expect(value.ALLOWED_ORIGINS).toBe(
      'https://example.com,https://app.bookdrop.io',
    );
  });

  it('fails validation when JWT_ACCESS_SECRET is missing', () => {
    const { error } = envValidationSchema.validate({
      DATABASE_URL: validConfig.DATABASE_URL,
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('JWT_ACCESS_SECRET is required');
  });

  it('fails validation when JWT_ACCESS_SECRET is shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate({
      ...validConfig,
      JWT_ACCESS_SECRET: 'too-short-secret',
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain(
      'JWT_ACCESS_SECRET must be at least 32 characters long',
    );
  });

  it('defaults LIBRARY_TIMEZONE to UTC when omitted', () => {
    const { error, value } = envValidationSchema.validate(validConfig);
    expect(error).toBeUndefined();
    expect(value.LIBRARY_TIMEZONE).toBe('UTC');
  });

  it('accepts valid IANA timezone names for LIBRARY_TIMEZONE', () => {
    const { error, value } = envValidationSchema.validate({
      ...validConfig,
      LIBRARY_TIMEZONE: 'Asia/Colombo',
    });
    expect(error).toBeUndefined();
    expect(value.LIBRARY_TIMEZONE).toBe('Asia/Colombo');
  });

  it('fails validation when LIBRARY_TIMEZONE is an invalid timezone name', () => {
    const { error } = envValidationSchema.validate({
      ...validConfig,
      LIBRARY_TIMEZONE: 'Invalid/NonExistent_Zone',
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain(
      'LIBRARY_TIMEZONE must be a valid IANA timezone name',
    );
  });

  it('defaults email notification variables correctly', () => {
    const { error, value } = envValidationSchema.validate(validConfig);
    expect(error).toBeUndefined();
    expect(value.EMAIL_PROVIDER).toBe('console');
    expect(value.EMAIL_MAX_PER_SECOND).toBe(1);
    expect(value.EMAIL_FROM).toBe('noreply@bookdrop.io');
    expect(value.EMAIL_FROM_NAME).toBe('Bookdrop Library');
    expect(value.SES_REGION).toBe('ap-south-1');
  });

  it('rejects invalid EMAIL_PROVIDER values', () => {
    const { error } = envValidationSchema.validate({
      ...validConfig,
      EMAIL_PROVIDER: 'sendgrid',
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('EMAIL_PROVIDER');
  });

  it('fails validation when DATABASE_URL is missing', () => {
    const { error } = envValidationSchema.validate({
      JWT_ACCESS_SECRET: validConfig.JWT_ACCESS_SECRET,
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('DATABASE_URL is required');
  });
});
