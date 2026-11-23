import type { SubscriptionWindows } from '#improvement/application/ports/test-generator.port';
import type { RateLimitInfo } from '#improvement/infrastructure/generator/claude-stream.schema';
import { Instant } from '#kernel/time/instant';

const MS_PER_SECOND = 1000;

/** The window that opens again within hours. Every other one is waited out by nobody. */
const FIVE_HOUR = 'five_hour';

/**
 * The statuses of a usage limit that mean it is spent. Only `allowed` was
 * seen in a run. `rejected` is assumed from the client libraries of the
 * CLI and not measured, so it is the one place to change once a spent
 * limit has been seen.
 */
const SPENT_STATUSES: ReadonlySet<string> = new Set(['rejected']);

type Window = SubscriptionWindows['fiveHour'];

/** The outcome of a call that stopped on a spent limit. */
export type SpentLimit =
  | { readonly outcome: 'window_exhausted'; readonly resumesAt: Instant | null }
  | { readonly outcome: 'quota_exhausted' };

function instantOf(epochSeconds: number): Instant {
  return Instant.fromEpochMilliseconds(
    Math.round(epochSeconds * MS_PER_SECOND),
  );
}

/**
 * When the five-hour window opens again. A moment the CLI gives in the
 * past, after a skew of clocks or a late event, is read as now: the
 * window is open by the clock of the service.
 */
function reopeningOf(info: RateLimitInfo, now: Instant): Instant | null {
  const seconds = info.resetsAt ?? info.unifiedWindows?.five_hour?.resetsAt;
  if (seconds === undefined) {
    return null;
  }
  const reset = instantOf(seconds);
  return reset.isBefore(now) ? now : reset;
}

/**
 * The limit a failed call stopped on, from the last state of the limits
 * the CLI reported, or `null` when none is spent. A spent five-hour
 * window is waited for. Any other spent limit, the weekly one or one the
 * adapter does not know, ends the improvement.
 */
export function spentLimitOf(
  info: RateLimitInfo | null,
  now: Instant,
): SpentLimit | null {
  if (info === null || !SPENT_STATUSES.has(info.status)) {
    return null;
  }
  return info.rateLimitType === FIVE_HOUR
    ? { outcome: 'window_exhausted', resumesAt: reopeningOf(info, now) }
    : { outcome: 'quota_exhausted' };
}

function windowOf(
  window:
    | { readonly utilization: number; readonly resetsAt: number }
    | null
    | undefined,
): Window {
  if (window === null || window === undefined) {
    return null;
  }
  return {
    utilization: Math.min(window.utilization, 1),
    resetsAt: instantOf(window.resetsAt),
  };
}

/** The two windows of a subscription, or `null` when the CLI named neither. */
export function windowsOf(
  info: RateLimitInfo | null,
): SubscriptionWindows | null {
  const fiveHour = windowOf(info?.unifiedWindows?.five_hour);
  const sevenDay = windowOf(info?.unifiedWindows?.seven_day);
  return fiveHour === null && sevenDay === null ? null : { fiveHour, sevenDay };
}
