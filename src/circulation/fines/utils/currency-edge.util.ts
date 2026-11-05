import { MAX_ASSESSED_FINE_MINOR } from '../../../config/library-rules';
import { InvalidAmountError } from '../errors/invalid-amount.error';

/**
 * Validates and converts an API edge decimal Rupee amount to integer minor units (paise).
 *
 * Rules:
 * - Must be a finite number.
 * - Must be strictly positive (or non-negative if allowZero is true).
 * - Must have at most 2 decimal places (rejects fractional sub-cent precision).
 * - Must not exceed MAX_ASSESSED_FINE_MINOR.
 * - Rejection throws an InvalidAmountError with code INVALID_AMOUNT.
 *
 * @param amountRs Rupee amount from GraphQL input.
 * @param fieldName Descriptive field name for error messaging.
 * @param allowZero Whether zero is permitted (e.g. for optional fees).
 * @returns Integer minor units (paise).
 */
export function parseRupeesToMinor(
  amountRs: number | null | undefined,
  fieldName = 'amount',
  allowZero = false,
): number {
  if (amountRs === null || amountRs === undefined) {
    throw new InvalidAmountError(`${fieldName} is required`);
  }

  if (typeof amountRs !== 'number' || !Number.isFinite(amountRs)) {
    throw new InvalidAmountError(`${fieldName} must be a valid finite number`);
  }

  if (allowZero ? amountRs < 0 : amountRs <= 0) {
    throw new InvalidAmountError(
      `${fieldName} must be ${allowZero ? 'non-negative' : 'greater than zero'}, received: ${amountRs}`,
    );
  }

  const str = amountRs.toString();
  if (str.includes('.')) {
    const decimalPart = str.split('.')[1];
    if (decimalPart.length > 2) {
      throw new InvalidAmountError(
        `${fieldName} cannot have more than 2 decimal places, received: ${amountRs}`,
      );
    }
  }

  const minor = Math.round(amountRs * 100);

  if (Math.abs(minor / 100 - amountRs) > 0.0000001) {
    throw new InvalidAmountError(
      `${fieldName} contains fractional precision beyond 2 decimal places`,
    );
  }

  if (minor > MAX_ASSESSED_FINE_MINOR) {
    throw new InvalidAmountError(
      `${fieldName} exceeds maximum allowable amount of ${MAX_ASSESSED_FINE_MINOR / 100} Rs`,
    );
  }

  return minor;
}

/**
 * Converts minor units (paise) back to a two-decimal Rupee number.
 */
export function minorToRs(minor: number): number {
  if (!Number.isInteger(minor)) {
    return 0;
  }
  return Number((minor / 100).toFixed(2));
}
