import { IClock } from './clock.service';

/**
 * Controllable clock implementation for unit and integration testing.
 * Allows deterministic tests to freeze and advance time across hold deadlines.
 */
export class FakeClockService implements IClock {
  private currentTime: Date;

  constructor(initialTime?: Date | string | number) {
    this.currentTime = initialTime
      ? new Date(initialTime)
      : new Date('2026-10-21T12:00:00.000Z');
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  advanceHours(hours: number): void {
    this.advanceMs(hours * 60 * 60 * 1000);
  }

  advanceDays(days: number): void {
    this.advanceMs(days * 24 * 60 * 60 * 1000);
  }
}
