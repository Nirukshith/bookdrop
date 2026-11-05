import { MAX_BOOK_PRICE_RS } from '../../config/library-rules';
import { parseBookPriceToMinor } from './book-price-edge.util';

describe('BookPriceEdgeUtil (Unit Tests)', () => {
  it('returns null when priceRs is null or undefined', () => {
    expect(parseBookPriceToMinor(null)).toBeNull();
    expect(parseBookPriceToMinor(undefined)).toBeNull();
  });

  it('converts valid rupee amounts to integer minor units', () => {
    expect(parseBookPriceToMinor(100)).toBe(10000);
    expect(parseBookPriceToMinor(499.99)).toBe(49999);
    expect(parseBookPriceToMinor(50.5)).toBe(5050);
    expect(parseBookPriceToMinor(0.01)).toBe(1);
    expect(parseBookPriceToMinor(MAX_BOOK_PRICE_RS)).toBe(100000000);
  });

  it('rejects non-finite, NaN, and negative amounts with INVALID_PRICE', () => {
    expect(() => parseBookPriceToMinor(NaN)).toThrow(/valid finite number/);
    expect(() => parseBookPriceToMinor(Infinity)).toThrow(/valid finite number/);
    expect(() => parseBookPriceToMinor(0)).toThrow(/greater than zero/);
    expect(() => parseBookPriceToMinor(-50)).toThrow(/greater than zero/);
  });

  it('rejects sub-cent precision (>2 decimal places) with INVALID_PRICE', () => {
    expect(() => parseBookPriceToMinor(10.555)).toThrow(
      /cannot have more than 2 decimal places/,
    );
    expect(() => parseBookPriceToMinor(100.001)).toThrow(
      /cannot have more than 2 decimal places/,
    );
  });

  it('rejects amounts exceeding MAX_BOOK_PRICE_RS with INVALID_PRICE', () => {
    expect(() => parseBookPriceToMinor(MAX_BOOK_PRICE_RS + 1)).toThrow(
      /exceeds maximum allowed book price/,
    );
  });
});
