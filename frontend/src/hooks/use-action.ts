import { useRef, useState } from 'react';

/** Where an action of a person is: not started, running, or ended. */
export type ActionState<Outcome> =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | { readonly phase: 'ended'; readonly outcome: Outcome }
  | { readonly phase: 'failed'; readonly failure: unknown };

/** An action a key starts, and what became of it. */
export interface Action<Outcome> {
  readonly state: ActionState<Outcome>;
  /** Starts the work, unless the work this action started still runs. */
  readonly start: (work: () => Promise<Outcome>) => void;
}

const IDLE = { phase: 'idle' } as const;

/**
 * Runs the work a key asks for, once at a time. The guard is a reference
 * and not the state, so a second key that comes before the screen is
 * drawn again starts nothing either.
 */
export function useAction<Outcome>(): Action<Outcome> {
  const [state, setState] = useState<ActionState<Outcome>>(IDLE);
  const running = useRef(false);
  const run = async (work: () => Promise<Outcome>): Promise<void> => {
    try {
      const outcome = await work();
      setState({ phase: 'ended', outcome });
    } catch (failure: unknown) {
      setState({ phase: 'failed', failure });
    } finally {
      running.current = false;
    }
  };
  return {
    state,
    start: (work) => {
      if (running.current) {
        return;
      }
      running.current = true;
      setState({ phase: 'running' });
      void run(work);
    },
  };
}
