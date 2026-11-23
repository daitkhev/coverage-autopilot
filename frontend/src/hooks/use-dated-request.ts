import { useCallback } from 'react';

import {
  type RepeatedRequest,
  useRepeatedRequest,
} from '#hooks/use-repeated-request';

/** The last answer of a request, and the moment it came. */
export interface DatedRequest<Answer> extends RepeatedRequest<Answer> {
  /** When the last answer came, so a screen can say how fresh it is. */
  readonly answeredAt: string | undefined;
}

interface DatedRequestOptions {
  /** The moment now. It is given, so a test decides what the time is. */
  readonly now: () => string;
  readonly everyMs: number;
}

/**
 * Repeats a request as `useRepeatedRequest` does, and keeps the moment
 * each answer came. The request and the clock must keep their identity
 * between renders, or the request starts over.
 */
export function useDatedRequest<Answer>(
  request: () => Promise<Answer>,
  { now, everyMs }: DatedRequestOptions,
): DatedRequest<Answer> {
  const dated = useCallback(async () => {
    const answer = await request();
    return { answer, at: now() };
  }, [request, now]);
  const repeated = useRepeatedRequest(dated, everyMs);
  return {
    answer: repeated.answer?.answer,
    answeredAt: repeated.answer?.at,
    stale: repeated.stale,
    failure: repeated.failure,
  };
}
