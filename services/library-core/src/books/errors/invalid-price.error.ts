import { GraphQLError } from 'graphql';

export class InvalidPriceError extends GraphQLError {
  constructor(message = 'Invalid book price') {
    super(message, {
      extensions: {
        code: 'INVALID_PRICE',
      },
    });
  }
}
