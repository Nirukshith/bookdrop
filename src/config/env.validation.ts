import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required().messages({
    'any.required': 'DATABASE_URL is required',
  }),
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_ACCESS_SECRET must be at least 32 characters long',
    'any.required': 'JWT_ACCESS_SECRET is required',
  }),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().positive().default(7),
  SEED_ADMIN_PASSWORD: Joi.string().optional(),
  SEED_LIBRARIAN_PASSWORD: Joi.string().optional(),
  SEED_MEMBER_PASSWORD: Joi.string().optional(),
  TRUST_PROXY: Joi.boolean().default(false),
  ALLOWED_ORIGINS: Joi.string().allow('').default(''),
  SCHEDULER_ENABLED: Joi.boolean().default(false),
  EMAIL_PROVIDER: Joi.string()
    .valid('console', 'smtp', 'ses')
    .default('console'),
  EMAIL_MAX_PER_SECOND: Joi.number().positive().default(1),
  EMAIL_FROM: Joi.string().email().default('noreply@bookdrop.io'),
  EMAIL_FROM_NAME: Joi.string().default('Bookdrop Library'),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().integer().positive().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SES_REGION: Joi.string().optional().default('ap-south-1'),
  LIBRARY_TIMEZONE: Joi.string()
    .default('UTC')
    .custom((value, helpers) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: value });
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .messages({
      'any.invalid':
        'LIBRARY_TIMEZONE must be a valid IANA timezone name (e.g. "Asia/Colombo", "UTC")',
    }),
});
