import { useRef, useState } from 'react';

/** An action that takes time, and whether it runs now. */
export interface OneAtATime {
  readonly running: boolean;
  /**
   * Starts the action, unless one runs: then it starts nothing. The
   * action keeps its own outcome, a failure too, as state of the screen.
   */
  readonly run: (action: () => Promise<void>) => void;
}

/**
 * Runs an action that takes time, one at a time, so a second press of
 * its key while it runs starts nothing. The guard is a reference and not
 * the state, because two keys can come before the screen draws again.
 */
export function useOneAtATime(): OneAtATime {
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const finish = (): void => {
    busy.current = false;
    setRunning(false);
  };
  return {
    running,
    run: (action) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setRunning(true);
      void action().finally(finish);
    },
  };
}
