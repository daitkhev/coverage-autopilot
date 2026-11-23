/**
 * Waits a while before the next look at something another process may
 * change. A test gives one it settles itself, so nothing waits for real.
 */
export type Pause = (ms: number) => Promise<void>;

/** The pause of the service: a timer of Node, which reads no clock. */
export async function timerPause(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
