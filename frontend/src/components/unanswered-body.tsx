import { Text } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import { Glyph } from '#components/glyph';
import { Panel } from '#components/panel';
import {
  type Problem,
  ProblemDetails,
  problemOf,
} from '#components/problem-details';
import { RoleText } from '#components/role-text';
import type { RepeatedRequest } from '#hooks/use-repeated-request';

/**
 * What stands where the answer of a screen would be: nothing yet, the
 * refusal of the service, or a fault of the request.
 */
export type Unanswered = { readonly kind: 'waiting' } | Problem;

/** What a screen shows: the value it asked for, or what stands instead. */
export type Shown<Value> =
  Unanswered | { readonly kind: 'answered'; readonly value: Value };

/** An answer of the service as a screen reads it: a value or a refusal. */
type Reply<Value> =
  | { readonly outcome: 'answered'; readonly value: Value }
  | { readonly outcome: 'refused'; readonly error: ErrorBody };

/**
 * What a screen shows of a request it repeats: what went wrong with it
 * in place of the answer, else the answer, else that it is on its way.
 */
export function shownOf<Value>(
  request: RepeatedRequest<Reply<Value>>,
  isUnreachable: (failure: unknown) => boolean,
): Shown<Value> {
  const problem = problemOf(request, isUnreachable);
  if (problem !== undefined) {
    return problem;
  }
  const { answer } = request;
  return answer?.outcome === 'answered'
    ? { kind: 'answered', value: answer.value }
    : { kind: 'waiting' };
}

interface UnansweredBodyProps {
  /** The title of the panel the answer would have filled. */
  readonly title: string;
  /** What did not happen, such as "The patch could not be read". */
  readonly headline: string;
  readonly state: Unanswered;
}

/** What to do: a refusal holds for this screen, a fault for the client. */
const NEXT: Readonly<Record<Problem['kind'], string>> = {
  refused: 'Press esc to go back.',
  fault:
    'Check that the client and the service are of one version: coverage-autopilot doctor.',
};

/**
 * The body of a screen whose answer is not there: it is on its way, the
 * service refused it, or the request failed. A fault is shown and never
 * hidden behind an old answer.
 */
export function UnansweredBody({
  title,
  headline,
  state,
}: UnansweredBodyProps): ReactNode {
  return (
    <Panel title={title} focused>
      {state.kind === 'waiting' ? (
        <Text>
          <Glyph name="spinner" role="running" />{' '}
          <RoleText>Asking the service</RoleText>
        </Text>
      ) : (
        <ProblemDetails
          headline={headline}
          problem={state}
          next={NEXT[state.kind]}
        />
      )}
    </Panel>
  );
}
