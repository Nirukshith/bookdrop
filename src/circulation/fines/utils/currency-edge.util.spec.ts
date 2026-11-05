import { parseRupeesToMinor, minorToRs } from './currency-edge.util';
import { InvalidAmountError } from '../errors/invalid-amount.error';
import { MAX_ASSESSED_FINE_MINOR } from '../../../config/library-rules';

describe('currency-edge.util', () => {
  describe('parseRupeesToMinor', () => {
    it('converts whole rupees to paise', () => {
      expect(parseRupeesToMinor(10)).toBe(1000);
      expect(parseRupeesToMinor(100)).toBe(10000);
    });

    it('converts 1 and 2 decimal rupees to paise', () => {
      expect(parseRupeesToMinor(10.5)).toBe(1050);
      expect(parseRupeesToMinor(10.55)).toBe(1055);
      expect(parseRupeesToMinor(0.05)).toBe(5);
      expect(parseRupeesToMinor(0.99)).toBe(99);
    });

    it('rejects sub-cent amounts with more than 2 decimal places', () => {
      expect(() => parseRupeesToMinor(10.555)).toThrow(InvalidAmountError);
      expect(() => parseRupeesToMinor(10.001)).toThrow(InvalidAmountError);
      expect(() => parseRupeesToMinor(0.1234)).toThrow(InvalidAmountError);
    });

    it('rejects zero when allowZero is false', () => {
      expect(() => parseRupeesToMinor(0)).toThrow(InvalidAmountError);
    });

    it('allows zero when allowZero is true', () => {
      expect(parseRupeesToMinor(0, 'fee', true)).toBe(0);
    });

    it('rejects negative numbers', () => {
      expect(() => parseRupeesToMinor(-5)).toThrow(InvalidAmountError);
      expect(() => parseRupeesToMinor(-0.01, 'fee', true)).toThrow(
        InvalidAmountError,
      );
    });

    it('rejects null, undefined, NaN, and Infinity', () => {
      expect(() => parseRupeesToMinor(null as any)).toThrow(InvalidAmountError);
      expect(() => parseRupeesToMinor(undefined as any)).toThrow(
        InvalidAmountError,
      );
      expect(() => parseRupeesToMinor(NaN)).toThrow(InvalidAmountError);
      expect(() => parseRupeesToMinor(Infinity)).toThrow(InvalidAmountError);
    });

    it('rejects amounts exceeding MAX_ASSESSED_FINE_MINOR', () => {
      const overMax = MAX_ASSESSED_FINE_MINOR / 100 + 1;
      expect(() => parseRupeesToMinor(overMax)).toThrow(InvalidAmountError);
    });

    it('has code INVALID_AMOUNT on thrown error', () => {
      try {
        parseRupeesToMinor(10.555);
        fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidAmountError);
        expect(e.code).toBe('INVALID_AMOUNT');
        expect(e.getResponse().code).toBe('INVALID_AMOUNT');
      }
    });
  });

  describe('minorToRs', () => {
    it('converts paise to rupees with two decimal places', () => {
      expect(minorToRs(1055)).toBe(10.55);
      expect(minorToRs(1000)).toBe(10);
      expect(minorToRs(5)).toBe(0.05);
      expect(minorToRs(0)).toBe(0);
    });
  });
});

