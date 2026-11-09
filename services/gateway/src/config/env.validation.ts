import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  IDENTITY_SUBGRAPH_URL: Joi.string()
    .uri()
    .default('http://localhost:3001/graphql'),
  LIBRARY_CORE_SUBGRAPH_URL: Joi.string()
    .uri()
    .default('http://localhost:3002/graphql'),
});

