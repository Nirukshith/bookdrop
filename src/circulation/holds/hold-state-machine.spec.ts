import {
  calculateHoldExpiresAt,
  PICKUP_HOLD_DAYS,
} from '../../config/library-rules';
import { InvalidHoldStateTransitionError } from './errors/invalid-hold-state-transition.error';
import {
  ALLOWED_HOLD_TRANSITIONS,
  assertValidHoldTransition,
  canTransitionHold,
  HoldStatus,
  isTerminalHoldStatus,
} from './hold-state-machine';

describe('HoldStateMachine (Step 1 Pure Function & Transition Rules)', () => {
  describe('ALLOWED_HOLD_TRANSITIONS matrix', () => {
    it('defines exactly the allowed outgoing transitions for each status', () => {
      expect(ALLOWED_HOLD_TRANSITIONS[HoldStatus.ACTIVE]).toEqual([
        HoldStatus.FULFILLED,
        HoldStatus.CANCELLED,
        HoldStatus.EXPIRED,
      ]);
      expect(ALLOWED_HOLD_TRANSITIONS[HoldStatus.FULFILLED]).toEqual([]);
      expect(ALLOWED_HOLD_TRANSITIONS[HoldStatus.CANCELLED]).toEqual([]);
      expect(ALLOWED_HOLD_TRANSITIONS[HoldStatus.EXPIRED]).toEqual([]);
    });
  });

  describe('isTerminalHoldStatus', () => {
    it('returns false for ACTIVE', () => {
      expect(isTerminalHoldStatus(HoldStatus.ACTIVE)).toBe(false);
    });

    it.each([HoldStatus.FULFILLED, HoldStatus.CANCELLED, HoldStatus.EXPIRED])(
      'returns true for terminal status %s',
      (status) => {
        expect(isTerminalHoldStatus(status)).toBe(true);
      },
    );
  });

  describe('Allowed Transitions from ACTIVE', () => {
    it.each([
      [HoldStatus.FULFILLED, 'picked up by patron'],
      [HoldStatus.CANCELLED, 'cancelled by patron or staff'],
      [HoldStatus.EXPIRED, 'pickup window elapsed'],
    ])('allows ACTIVE -> %s (%s)', (targetStatus) => {
      const result = canTransitionHold(HoldStatus.ACTIVE, targetStatus);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();

      expect(() =>
        assertValidHoldTransition(HoldStatus.ACTIVE, targetStatus),
      ).not.toThrow();
    });
  });

  describe('Forbidden Self-Transitions', () => {
    it.each([
      HoldStatus.ACTIVE,
      HoldStatus.FULFILLED,
      HoldStatus.CANCELLED,
      HoldStatus.EXPIRED,
    ])('forbids self-transition %s -> %s', (status) => {
      const result = canTransitionHold(status, status);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(`already in status '${status}'`);

      expect(() => assertValidHoldTransition(status, status)).toThrow(
        InvalidHoldStateTransitionError,
      );
    });
  });

  describe('Forbidden Transitions from Terminal States', () => {
    const terminalStatuses = [
      HoldStatus.FULFILLED,
      HoldStatus.CANCELLED,
      HoldStatus.EXPIRED,
    ];

    const allStatuses = [
      HoldStatus.ACTIVE,
      HoldStatus.FULFILLED,
      HoldStatus.CANCELLED,
      HoldStatus.EXPIRED,
    ];

    // For every terminal status, test every possible target (except self, tested above)
    const testCases: Array<[HoldStatus, HoldStatus]> = [];
    for (const from of terminalStatuses) {
      for (const to of allStatuses) {
        if (from !== to) {
          testCases.push([from, to]);
        }
      }
    }

    it.each(testCases)(
      'forbids transition from terminal status %s to %s',
      (from, to) => {
        const result = canTransitionHold(from, to);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('is terminal and cannot transition');

        expect(() => assertValidHoldTransition(from, to)).toThrow(
          InvalidHoldStateTransitionError,
        );
      },
    );
  });

  describe('calculateHoldExpiresAt (Pickup Deadline Calculation)', () => {
    it('calculates deadline exactly PICKUP_HOLD_DAYS (24h) from a given timestamp', () => {
      const baseDate = new Date('2026-10-21T10:00:00.000Z');
      const expected = new Date('2026-10-22T10:00:00.000Z');

      const expiresAt = calculateHoldExpiresAt(baseDate);

      expect(expiresAt.toISOString()).toBe(expected.toISOString());
      expect(expiresAt.getTime() - baseDate.getTime()).toBe(
        PICKUP_HOLD_DAYS * 24 * 60 * 60 * 1000,
      );
    });

    it('defaults to current time if no base date is passed', () => {
      const before = new Date();
      const expiresAt = calculateHoldExpiresAt();
      const after = new Date();

      const expectedBefore = new Date(before);
      expectedBefore.setDate(expectedBefore.getDate() + PICKUP_HOLD_DAYS);

      const expectedAfter = new Date(after);
      expectedAfter.setDate(expectedAfter.getDate() + PICKUP_HOLD_DAYS);

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedBefore.getTime() - 1000,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        expectedAfter.getTime() + 1000,
      );
    });
  });
});
