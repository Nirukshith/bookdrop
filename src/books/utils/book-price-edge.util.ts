import { MAX_BOOK_PRICE_RS, PAISE_PER_RUPEE } from '../../config/library-rules';
import { InvalidPriceError } from '../errors/invalid-price.error';

/**
 * Validates and converts a book replacement price in Rupees from the GraphQL edge to minor units (paise).
 *
 * Rules:
 * - Null or undefined returns null (price is optional; null means "not set").
 * - Must be a finite number.
 * - Must be strictly positive (> 0).
 * - Must have at most 2 decimal places.
 * - Must not exceed MAX_BOOK_PRICE_RS (1,000,000 Rs).
 * - Rejection throws an InvalidPriceError with code INVALID_PRICE.
 *
 * @param priceRs Rupee amount from GraphQL input.
 * @returns Integer minor units (paise) or null.
 */
export function parseBookPriceToMinor(
  priceRs: number | null | undefined,
): number | null {
  if (priceRs === null || priceRs === undefined) {
    return null;
  }

  if (typeof priceRs !== 'number' || !Number.isFinite(priceRs)) {
    throw new InvalidPriceError('Book price must be a valid finite number');
  }

  if (priceRs <= 0) {
    throw new InvalidPriceError(
      `Book price must be greater than zero, received: ${priceRs}`,
    );
  }

  const str = priceRs.toString();
  if (str.includes('.')) {
    const decimalPart = str.split('.')[1];
    if (decimalPart.length > 2) {
      throw new InvalidPriceError(
        `Book price cannot have more than 2 decimal places, received: ${priceRs}`,
      );
    }
  }

  const minor = Math.round(priceRs * PAISE_PER_RUPEE);

  if (Math.abs(minor / PAISE_PER_RUPEE - priceRs) > 0.0000001) {
    throw new InvalidPriceError(
      'Book price contains fractional precision beyond 2 decimal places',
    );
  }

  if (priceRs > MAX_BOOK_PRICE_RS) {
    throw new InvalidPriceError(
      `Book price ${priceRs} Rs exceeds maximum allowed book price of ${MAX_BOOK_PRICE_RS} Rs`,
    );
  }

  return minor;
}
