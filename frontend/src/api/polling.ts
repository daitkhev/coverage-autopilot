/**
 * How long the client waits for a service to answer or to go. The client
 * reads no clock, so the wait is counted in pauses.
 */
export interface ServiceWait {
  /** The whole wait. */
  readonly totalMs: number;
  /** The pause between two looks. */
  readonly intervalMs: number;
}

/** A wait, and the pause to wait with. */
export interface Waiting {
  readonly wait: ServiceWait;
  readonly pause: (ms: number) => Promise<void>;
}

/**
 * Looks until `done` says so, with a pause between two looks, and says
 * whether it was done in time. The first look is at once, and the last
 * comes after the whole wait was paused.
 */
export async function pollUntil(
  waiting: Waiting,
  done: () => boolean | Promise<boolean>,
): Promise<boolean> {
  const { totalMs, intervalMs } = waiting.wait;
  const pauses = Math.ceil(totalMs / intervalMs);
  for (let paused = 0; paused < pauses; paused += 1) {
    if (await done()) {
      return true;
    }
    await waiting.pause(intervalMs);
  }
  return done();
}
