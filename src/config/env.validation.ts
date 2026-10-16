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
});
