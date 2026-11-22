export interface Clock {
  readonly now: () => Temporal.Instant;
}

export function stamp(clock: Clock): string {
  return clock.now().toString();
}

export function elapsed(since: Temporal.Instant, clock: Clock): number {
  return clock.now().since(since).total('milliseconds');
}
