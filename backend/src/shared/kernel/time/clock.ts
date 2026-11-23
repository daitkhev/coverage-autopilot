import type { Instant } from '#kernel/time/instant';

/**
 * Tells the time. The domain and the application take one instead of
 * reading the real time, so a test decides what the time is.
 */
export interface Clock {
  now(): Instant;
}

/** The injection token of the clock. */
export const CLOCK = Symbol('Clock');
