import { EventEmitter } from 'node:events';

import type { ProcessSignals } from '#composition/process-signals';

type SentSignal = Parameters<ProcessSignals['on']>[0];

/**
 * The signals of a process, as a test sends them: the test process
 * itself is never sent one, and never ended.
 */
export interface SignalStandIn extends ProcessSignals {
  /** Sends a signal, as the system does to a process. */
  send(signal: SentSignal): void;
  /** The codes the client ended the process with, in order. */
  readonly exits: readonly number[];
  /** How many listeners still wait for a signal. */
  listeners(): number;
}

export function signalStandIn(): SignalStandIn {
  const emitter = new EventEmitter();
  const exits: number[] = [];
  return {
    on: (signal, listener) => emitter.on(signal, listener),
    off: (signal, listener) => emitter.off(signal, listener),
    exit: (code) => {
      exits.push(code);
    },
    send: (signal) => {
      emitter.emit(signal);
    },
    exits,
    listeners: () =>
      emitter
        .eventNames()
        .reduce((count, name) => count + emitter.listenerCount(name), 0),
  };
}
