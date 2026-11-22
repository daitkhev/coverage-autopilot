import type { Instant } from '#kernel/time/instant';

/** Takes an alarm back. After the alarm rang it does nothing. */
export type AlarmCancel = () => void;

/**
 * Calls back at a moment. The application takes one instead of a timer of
 * the runtime, so a test decides when a moment comes, as it does with the
 * clock.
 */
export interface Alarm {
  /**
   * Calls `ring` once when `moment` comes, and at the next turn when it
   * has passed already. The caller takes the alarm back when its work is
   * over, so no timer outlives it.
   */
  set(moment: Instant, ring: () => void): AlarmCancel;
}

/** The injection token of the alarm. */
export const ALARM = Symbol('Alarm');
