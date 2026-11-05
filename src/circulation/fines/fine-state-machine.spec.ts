import { FineStatus } from '@prisma/client';
import {
  ALLOWED_FINE_TRANSITIONS,
  assertValidFineTransition,
  canTransitionFine,
  isTerminalFineStatus,
} from './fine-state-machine';
import { InvalidFineStateTransitionError } from './errors/invalid-fine-state-transition.error';

describe('Fine State Machine (Unit Tests)', () => {
  const allStatuses: FineStatus[] = [
    FineStatus.UNPAID,
    FineStatus.PARTIALLY_PAID,
    FineStatus.PAID,
    FineStatus.WAIVED,
  ];

  describe('ALLOWED_FINE_TRANSITIONS table', () => {
    it('accurately defines allowed transitions matching specification', () => {
      expect(ALLOWED_FINE_TRANSITIONS[FineStatus.UNPAID]).toEqual([
        FineStatus.PARTIALLY_PAID,
        FineStatus.PAID,
        FineStatus.WAIVED,
      ]);
      expect(ALLOWED_FINE_TRANSITIONS[FineStatus.PARTIALLY_PAID]).toEqual([
        FineStatus.PAID,
        FineStatus.WAIVED,
      ]);
      expect(ALLOWED_FINE_TRANSITIONS[FineStatus.PAID]).toEqual([]);
      expect(ALLOWED_FINE_TRANSITIONS[FineStatus.WAIVED]).toEqual([]);
    });
  });

  describe('Terminal status check (isTerminalFineStatus)', () => {
    it('returns true for PAID and WAIVED', () => {
      expect(isTerminalFineStatus(FineStatus.PAID)).toBe(true);
      expect(isTerminalFineStatus(FineStatus.WAIVED)).toBe(true);
    });

    it('returns false for UNPAID and PARTIALLY_PAID', () => {
      expect(isTerminalFineStatus(FineStatus.UNPAID)).toBe(false);
      expect(isTerminalFineStatus(FineStatus.PARTIALLY_PAID)).toBe(false);
    });
  });

  describe('Allowed transitions', () => {
    const allowedTransitions: Array<[FineStatus, FineStatus]> = [
      [FineStatus.UNPAID, FineStatus.PARTIALLY_PAID],
      [FineStatus.UNPAID, FineStatus.PAID],
      [FineStatus.UNPAID, FineStatus.WAIVED],
      [FineStatus.PARTIALLY_PAID, FineStatus.PAID],
      [FineStatus.PARTIALLY_PAID, FineStatus.WAIVED],
    ];

    test.each(allowedTransitions)(
      'allows transition from %s to %s',
      (from, to) => {
        const result = canTransitionFine(from, to);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();

        expect(() => assertValidFineTransition(from, to)).not.toThrow();
      },
    );
  });

  describe('Forbidden transitions', () => {
    const allowedSet = new Set([
      `${FineStatus.UNPAID}->${FineStatus.PARTIALLY_PAID}`,
      `${FineStatus.UNPAID}->${FineStatus.PAID}`,
      `${FineStatus.UNPAID}->${FineStatus.WAIVED}`,
      `${FineStatus.PARTIALLY_PAID}->${FineStatus.PAID}`,
      `${FineStatus.PARTIALLY_PAID}->${FineStatus.WAIVED}`,
    ]);

    const forbiddenTransitions: Array<[FineStatus, FineStatus]> = [];

    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (!allowedSet.has(`${from}->${to}`)) {
          forbiddenTransitions.push([from, to]);
        }
      }
    }

    test.each(forbiddenTransitions)(
      'forbids transition from %s to %s',
      (from, to) => {
        const result = canTransitionFine(from, to);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();

        expect(() => assertValidFineTransition(from, to)).toThrow(
          InvalidFineStateTransitionError,
        );
      },
    );

    it.each(allStatuses)(
      'specifically forbids self-transition from %s to itself',
      (status) => {
        const result = canTransitionFine(status, status);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('already in status');
        expect(() => assertValidFineTransition(status, status)).toThrow(
          InvalidFineStateTransitionError,
        );
      },
    );

    it.each([FineStatus.PAID, FineStatus.WAIVED])(
      'identifies terminal status %s when rejecting transitions',
      (terminalStatus) => {
        const result = canTransitionFine(terminalStatus, FineStatus.UNPAID);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('is terminal and cannot transition');
      },
    );
  });
});
