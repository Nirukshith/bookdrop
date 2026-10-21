import { Injectable } from '@nestjs/common';

export interface IClock {
  /**
   * Returns current time in UTC Date.
   */
  now(): Date;
}

@Injectable()
export class ClockService implements IClock {
  now(): Date {
    return new Date();
  }
}
