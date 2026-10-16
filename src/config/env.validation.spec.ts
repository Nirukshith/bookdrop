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

  it('fails validation when DATABASE_URL is missing', () => {
    const { error } = envValidationSchema.validate({
      JWT_ACCESS_SECRET: validConfig.JWT_ACCESS_SECRET,
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('DATABASE_URL is required');
  });
});
