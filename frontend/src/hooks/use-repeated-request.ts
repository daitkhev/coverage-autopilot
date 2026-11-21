import { useEffect, useState } from 'react';

/** The last answer of a request, and whether the last try failed. */
export interface RepeatedRequest<Answer> {
  readonly answer: Answer | undefined;
  /** The last answer is kept and is not fresh, because the last try failed. */
  readonly stale: boolean;
  readonly failure: unknown;
}

const NOTHING_YET = { answer: undefined, stale: false, failure: undefined };

/**
 * Repeats a request it is given, a fixed time after each answer, so two
 * tries never overlap. A failure keeps the last answer and is repeated.
 * The request must keep its identity between renders, or it starts over.
 */
export function useRepeatedRequest<Answer>(
  request: () => Promise<Answer>,
  everyMs: number,
): RepeatedRequest<Answer> {
  const [state, setState] = useState<RepeatedRequest<Answer>>(NOTHING_YET);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async (): Promise<void> => {
      try {
        const answer = await request();
        if (live) {
          setState({ answer, stale: false, failure: undefined });
        }
      } catch (failure: unknown) {
        if (live) {
          setState((last) => ({ ...last, stale: true, failure }));
        }
      }
      if (live) {
        timer = setTimeout(() => {
          void ask();
        }, everyMs);
      }
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [request, everyMs]);
  return state;
}
