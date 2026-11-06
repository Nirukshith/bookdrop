import {
  ReservationStatus,
  ALLOWED_RESERVATION_TRANSITIONS,
  canTransitionReservation,
  assertValidReservationTransition,
  isTerminalReservationStatus,
} from './reservation-state-machine';
import { InvalidReservationStateTransitionError } from './errors/invalid-reservation-state-transition.error';

describe('ReservationStateMachine (Pure Logic Unit Tests)', () => {
  describe('ALLOWED_RESERVATION_TRANSITIONS definition', () => {
    it('defines transitions for every ReservationStatus enum value', () => {
      const statuses = Object.values(ReservationStatus);
      for (const status of statuses) {
        expect(ALLOWED_RESERVATION_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(ALLOWED_RESERVATION_TRANSITIONS[status])).toBe(
          true,
        );
      }
    });
  });

  describe('Allowed transitions from WAITING', () => {
    it('allows WAITING -> PROMOTED', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.WAITING,
          ReservationStatus.PROMOTED,
        ),
      ).toBe(true);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.WAITING,
          ReservationStatus.PROMOTED,
        ),
      ).not.toThrow();
    });

    it('allows WAITING -> CANCELLED', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.WAITING,
          ReservationStatus.CANCELLED,
        ),
      ).toBe(true);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.WAITING,
          ReservationStatus.CANCELLED,
        ),
      ).not.toThrow();
    });
  });

  describe('Forbidden transitions from WAITING', () => {
    it('forbids WAITING -> WAITING (self-transition)', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.WAITING,
          ReservationStatus.WAITING,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.WAITING,
          ReservationStatus.WAITING,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });
  });

  describe('Terminal state: PROMOTED', () => {
    it('is recognized as terminal', () => {
      expect(isTerminalReservationStatus(ReservationStatus.PROMOTED)).toBe(
        true,
      );
    });

    it('forbids PROMOTED -> WAITING', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.PROMOTED,
          ReservationStatus.WAITING,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.PROMOTED,
          ReservationStatus.WAITING,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });

    it('forbids PROMOTED -> CANCELLED', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.PROMOTED,
          ReservationStatus.CANCELLED,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.PROMOTED,
          ReservationStatus.CANCELLED,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });

    it('forbids PROMOTED -> PROMOTED', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.PROMOTED,
          ReservationStatus.PROMOTED,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.PROMOTED,
          ReservationStatus.PROMOTED,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });
  });

  describe('Terminal state: CANCELLED', () => {
    it('is recognized as terminal', () => {
      expect(isTerminalReservationStatus(ReservationStatus.CANCELLED)).toBe(
        true,
      );
    });

    it('forbids CANCELLED -> WAITING', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.CANCELLED,
          ReservationStatus.WAITING,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.CANCELLED,
          ReservationStatus.WAITING,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });

    it('forbids CANCELLED -> PROMOTED', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.CANCELLED,
          ReservationStatus.PROMOTED,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.CANCELLED,
          ReservationStatus.PROMOTED,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });

    it('forbids CANCELLED -> CANCELLED', () => {
      expect(
        canTransitionReservation(
          ReservationStatus.CANCELLED,
          ReservationStatus.CANCELLED,
        ),
      ).toBe(false);
      expect(() =>
        assertValidReservationTransition(
          ReservationStatus.CANCELLED,
          ReservationStatus.CANCELLED,
        ),
      ).toThrow(InvalidReservationStateTransitionError);
    });
  });

  describe('WAITING is non-terminal', () => {
    it('recognizes WAITING as not terminal', () => {
      expect(isTerminalReservationStatus(ReservationStatus.WAITING)).toBe(
        false,
      );
    });
  });
});
