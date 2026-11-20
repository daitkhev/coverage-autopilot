export interface Clock {
  readonly now: () => Date;
}

export function stamp(clock: Clock): string {
  return clock.now().toISOString();
}
