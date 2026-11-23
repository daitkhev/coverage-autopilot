import type { GenerationResult } from '#improvement/application/ports/test-generator.port';
import type { Instant } from '#kernel/time/instant';

/** A call that found the five-hour window of the subscription spent. */
export type SpentWindow = Extract<
  GenerationResult,
  { readonly outcome: 'window_exhausted' }
>;

/**
 * When the wait for a spent window ends. The aggregate takes only a
 * definite moment, and the generator may not say one: then the reset of
 * the window it last reported is taken while it is still ahead, and
 * otherwise the wait of the settings from now.
 */
export function waitEndOf(
  window: SpentWindow,
  now: Instant,
  limitWaitMs: number,
): Instant {
  if (window.resumesAt !== null) {
    return window.resumesAt;
  }
  const reset = window.windows?.fiveHour?.resetsAt;
  return reset !== undefined && now.isBefore(reset)
    ? reset
    : now.plusMilliseconds(limitWaitMs);
}
