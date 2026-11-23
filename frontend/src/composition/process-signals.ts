/**
 * The signals that end a run of the client as `q` does: the terminal was
 * closed, Ctrl+C came where the client does not read keys itself, before
 * the screens or in a command, and the process was asked to end.
 */
const LEAVE_SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;

type LeaveSignal = (typeof LEAVE_SIGNALS)[number];

/** By convention a process a signal ended exits with 128 and its number. */
const SIGNAL_EXIT_CODES: Readonly<Record<LeaveSignal, number>> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

/**
 * Where the signals of the process arrive, and the way to end it at once:
 * the process itself, which only the entry file touches.
 */
export interface ProcessSignals {
  on(signal: LeaveSignal, listener: () => void): unknown;
  off(signal: LeaveSignal, listener: () => void): unknown;
  exit(code: number): void;
}

/** The signals of one run of the client, from its start to its end. */
export interface SignalWatch {
  /** Aborted by the first signal, so the screens leave at once. */
  readonly leave: AbortSignal;
  /** The exit code of the first signal, once one came. */
  readonly code: Promise<number>;
  /**
   * Stops listening once the run has left what it started, so a later
   * signal ends the process as it would. After a signal the process ends
   * here with its code: what still runs, such as a command that waits
   * for work, is not waited for.
   */
  end(): void;
}

/**
 * Listens for the signals that end a run. The first one is taken, and
 * one that comes while the run leaves starts no second leave.
 */
export function watchSignals(signals: ProcessSignals): SignalWatch {
  const leaving = new AbortController();
  const caught = Promise.withResolvers<number>();
  let code: number | undefined;
  const listeners = LEAVE_SIGNALS.map((signal) => {
    const listener = (): void => {
      if (code === undefined) {
        code = SIGNAL_EXIT_CODES[signal];
        caught.resolve(code);
        leaving.abort();
      }
    };
    signals.on(signal, listener);
    return { signal, listener };
  });
  return {
    leave: leaving.signal,
    code: caught.promise,
    end: () => {
      for (const { signal, listener } of listeners) {
        signals.off(signal, listener);
      }
      if (code !== undefined) {
        signals.exit(code);
      }
    },
  };
}
