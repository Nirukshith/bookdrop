import { CopyStatus } from '@prisma/client';
import {
  ALLOWED_MANUAL_TRANSITIONS,
  assertCanRetireCopy,
  assertValidManualTransition,
  canRetireCopy,
  canTransitionManually,
} from './copy-state-machine';
import { InvalidCopyStateTransitionError } from './errors/invalid-copy-state-transition.error';

describe('Copy State Machine (Unit Tests)', () => {
  const allStatuses: CopyStatus[] = [
    CopyStatus.AVAILABLE,
    CopyStatus.ON_HOLD,
    CopyStatus.BORROWED,
    CopyStatus.LOST,
    CopyStatus.DAMAGED,
  ];

  describe('ALLOWED_MANUAL_TRANSITIONS table', () => {
    it('should define allowed transitions accurately matching specifications', () => {
      expect(ALLOWED_MANUAL_TRANSITIONS[CopyStatus.AVAILABLE]).toEqual([
        CopyStatus.LOST,
        CopyStatus.DAMAGED,
      ]);
      expect(ALLOWED_MANUAL_TRANSITIONS[CopyStatus.LOST]).toEqual([
        CopyStatus.AVAILABLE,
        CopyStatus.DAMAGED,
      ]);
      expect(ALLOWED_MANUAL_TRANSITIONS[CopyStatus.DAMAGED]).toEqual([
        CopyStatus.AVAILABLE,
        CopyStatus.LOST,
      ]);
      expect(ALLOWED_MANUAL_TRANSITIONS[CopyStatus.ON_HOLD]).toEqual([]);
      expect(ALLOWED_MANUAL_TRANSITIONS[CopyStatus.BORROWED]).toEqual([]);
    });
  });

  describe('Allowed manual transitions (isRetired: false)', () => {
    const allowedPairs: Array<[CopyStatus, CopyStatus]> = [
      [CopyStatus.AVAILABLE, CopyStatus.LOST],
      [CopyStatus.AVAILABLE, CopyStatus.DAMAGED],
      [CopyStatus.LOST, CopyStatus.AVAILABLE],
      [CopyStatus.LOST, CopyStatus.DAMAGED],
      [CopyStatus.DAMAGED, CopyStatus.AVAILABLE],
      [CopyStatus.DAMAGED, CopyStatus.LOST],
    ];

    test.each(allowedPairs)(
      'allows manual transition from %s to %s',
      (from, to) => {
        const result = canTransitionManually(
          { status: from, isRetired: false },
          to,
        );
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();

        expect(() =>
          assertValidManualTransition({ status: from, isRetired: false }, to),
        ).not.toThrow();
      },
    );
  });

  describe('Forbidden manual transitions for active copies (isRetired: false)', () => {
    const allowedSet = new Set([
      `${CopyStatus.AVAILABLE}->${CopyStatus.LOST}`,
      `${CopyStatus.AVAILABLE}->${CopyStatus.DAMAGED}`,
      `${CopyStatus.LOST}->${CopyStatus.AVAILABLE}`,
      `${CopyStatus.LOST}->${CopyStatus.DAMAGED}`,
      `${CopyStatus.DAMAGED}->${CopyStatus.AVAILABLE}`,
      `${CopyStatus.DAMAGED}->${CopyStatus.LOST}`,
    ]);

    const forbiddenPairs: Array<[CopyStatus, CopyStatus]> = [];

    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (!allowedSet.has(`${from}->${to}`)) {
          forbiddenPairs.push([from, to]);
        }
      }
    }

    test.each(forbiddenPairs)(
      'forbids transition from %s to %s',
      (from, to) => {
        const result = canTransitionManually(
          { status: from, isRetired: false },
          to,
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();

        expect(() =>
          assertValidManualTransition({ status: from, isRetired: false }, to),
        ).toThrow(InvalidCopyStateTransitionError);
      },
    );

    it('rejects target status ON_HOLD or BORROWED with workflow explanation', () => {
      const resultHold = canTransitionManually(
        { status: CopyStatus.AVAILABLE, isRetired: false },
        CopyStatus.ON_HOLD,
      );
      expect(resultHold.allowed).toBe(false);
      expect(resultHold.reason).toContain('reserved for holds and loans');

      const resultLoan = canTransitionManually(
        { status: CopyStatus.AVAILABLE, isRetired: false },
        CopyStatus.BORROWED,
      );
      expect(resultLoan.allowed).toBe(false);
      expect(resultLoan.reason).toContain('reserved for holds and loans');
    });

    it('rejects when current copy status is ON_HOLD or BORROWED', () => {
      const holdResult = canTransitionManually(
        { status: CopyStatus.ON_HOLD, isRetired: false },
        CopyStatus.AVAILABLE,
      );
      expect(holdResult.allowed).toBe(false);
      expect(holdResult.reason).toContain('cannot be manually changed');

      const borrowedResult = canTransitionManually(
        { status: CopyStatus.BORROWED, isRetired: false },
        CopyStatus.AVAILABLE,
      );
      expect(borrowedResult.allowed).toBe(false);
      expect(borrowedResult.reason).toContain('cannot be manually changed');
    });

    it('rejects transitioning to the same status', () => {
      const result = canTransitionManually(
        { status: CopyStatus.AVAILABLE, isRetired: false },
        CopyStatus.AVAILABLE,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Copy is already in status 'AVAILABLE'.");
    });
  });

  describe('Retired copies (isRetired: true)', () => {
    const allPairs: Array<[CopyStatus, CopyStatus]> = [];

    for (const from of allStatuses) {
      for (const to of allStatuses) {
        allPairs.push([from, to]);
      }
    }

    test.each(allPairs)(
      'forbids any transition from %s to %s when isRetired is true',
      (from, to) => {
        const result = canTransitionManually(
          { status: from, isRetired: true },
          to,
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Retired copies accept no status changes.');

        expect(() =>
          assertValidManualTransition({ status: from, isRetired: true }, to),
        ).toThrow(InvalidCopyStateTransitionError);
      },
    );
  });

  describe('Retirement eligibility (canRetireCopy / assertCanRetireCopy)', () => {
    it.each([CopyStatus.AVAILABLE, CopyStatus.LOST, CopyStatus.DAMAGED])(
      'allows retirement for status %s when not already retired',
      (status) => {
        const result = canRetireCopy({ status, isRetired: false });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();

        expect(() =>
          assertCanRetireCopy({ status, isRetired: false }),
        ).not.toThrow();
      },
    );

    it.each([CopyStatus.ON_HOLD, CopyStatus.BORROWED])(
      'forbids retirement when status is %s',
      (status) => {
        const result = canRetireCopy({ status, isRetired: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('cannot be retired');

        expect(() => assertCanRetireCopy({ status, isRetired: false })).toThrow(
          InvalidCopyStateTransitionError,
        );
      },
    );

    it('forbids retirement if copy is already retired', () => {
      const result = canRetireCopy({
        status: CopyStatus.AVAILABLE,
        isRetired: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Copy is already retired.');

      expect(() =>
        assertCanRetireCopy({ status: CopyStatus.AVAILABLE, isRetired: true }),
      ).toThrow(InvalidCopyStateTransitionError);
    });
  });
});
