/** Why a command is stopped before it ends by itself. */
type StopReason = 'timed_out' | 'aborted';

export interface RunLimit {
  /** Settles when the time is up or the signal is aborted, if ever. */
  readonly reached: Promise<StopReason>;
  /** Clears the timer and the listener once the command has ended. */
  readonly release: () => void;
}

/** Watches the time limit of a command and the signal of its caller. */
export function limitRun(timeoutMs: number, signal: AbortSignal): RunLimit {
  const { promise, resolve } = Promise.withResolvers<StopReason>();
  const onAbort = (): void => {
    resolve('aborted');
  };
  const timer = setTimeout(() => {
    resolve('timed_out');
  }, timeoutMs);
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    reached: promise,
    release: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    },
  };
}
