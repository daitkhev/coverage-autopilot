import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import { ErrorDetails } from '#components/error-details';
import type { RepeatedRequest } from '#hooks/use-repeated-request';
import type { StatusLook } from '#theme/status';

/** What went wrong with a request: the service refused it, or it threw. */
export type Problem =
  | { readonly kind: 'refused'; readonly error: ErrorBody }
  | { readonly kind: 'fault'; readonly fault: unknown };

/** Whether a failure is that the service does not answer at all. */
type UnreachableCheck = (failure: unknown) => boolean;

/** An answer of the service as a screen reads it: a value or a refusal. */
type Refusable =
  | { readonly outcome: 'answered' }
  | { readonly outcome: 'refused'; readonly error: ErrorBody };

/**
 * The fault of the last try of a repeated request, if it threw one. A
 * service that does not answer is no fault of the request: the screen
 * keeps its last answer, and its status line says that it is not fresh.
 */
export function faultOf(
  failure: unknown,
  isUnreachable: UnreachableCheck,
): Problem | undefined {
  return failure === undefined || isUnreachable(failure)
    ? undefined
    : { kind: 'fault', fault: failure };
}

/**
 * What went wrong with a repeated request: the fault of its last try,
 * which is newer than any answer, else the refusal of its last answer.
 */
export function problemOf(
  { answer, failure }: RepeatedRequest<Refusable>,
  isUnreachable: UnreachableCheck,
): Problem | undefined {
  return (
    faultOf(failure, isUnreachable) ??
    (answer?.outcome === 'refused'
      ? { kind: 'refused', error: answer.error }
      : undefined)
  );
}

interface ProblemDetailsProps {
  /** What did not happen, such as "Not connected". */
  readonly headline: string;
  /** What went wrong, or nothing when all went well. */
  readonly problem: Problem | undefined;
  readonly next: string;
}

interface Said {
  readonly code: string;
  readonly heading: string;
  readonly text: string;
}

const FAILED: StatusLook = { glyph: 'failed', word: 'failed', role: 'danger' };

function saidOf(problem: Problem): Said {
  if (problem.kind === 'refused') {
    return {
      code: problem.error.error,
      heading: 'THE SERVICE ANSWERED',
      text: problem.error.message,
    };
  }
  const { fault } = problem;
  return fault instanceof Error
    ? { code: fault.name, heading: 'THE CLIENT SAID', text: fault.message }
    : { code: 'fault', heading: 'THE CLIENT SAID', text: String(fault) };
}

/**
 * What went wrong with a request: what the service refused with, or the
 * fault it threw, never hidden. Nothing is drawn when neither happened.
 */
export function ProblemDetails({
  headline,
  problem,
  next,
}: ProblemDetailsProps): ReactNode {
  if (problem === undefined) {
    return null;
  }
  const said = saidOf(problem);
  return (
    <ErrorDetails
      look={FAILED}
      headline={headline}
      code={said.code}
      answer={{ heading: said.heading, text: said.text }}
      next={next}
    />
  );
}
