import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .default('amqp://bookdrop:bookdrop@localhost:5672'),
  EMAIL_PROVIDER: Joi.string()
    .valid('console', 'smtp', 'ses')
    .default('console'),
  EMAIL_FROM: Joi.string().default('Bookdrop Library <no-reply@bookdrop.io>'),
  SMTP_HOST: Joi.string().when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  SMTP_SECURE: Joi.boolean().default(false),
  AWS_REGION: Joi.string().when('EMAIL_PROVIDER', {
    is: 'ses',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  NOTIFICATION_LOCK_SECONDS: Joi.number().integer().positive().default(120),
  NOTIFICATION_BATCH_SIZE: Joi.number().integer().positive().default(20),
  NOTIFICATION_RATE_LIMIT_RPS: Joi.number().positive().default(1),
  NOTIFICATION_BURST_CAPACITY: Joi.number().integer().positive().default(5),
  SCHEDULER_ENABLED: Joi.boolean().default(true),
});

