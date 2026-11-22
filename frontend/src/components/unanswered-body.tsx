import { Text } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import { ErrorDetails } from '#components/error-details';
import { Glyph } from '#components/glyph';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import type { RepeatedRequest } from '#hooks/use-repeated-request';
import type { StatusLook } from '#theme/status';

/**
 * What stands where the answer of a screen would be: nothing yet, the
 * refusal of the service, or a fault of the request.
 */
export type Unanswered =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'refused'; readonly error: ErrorBody }
  | { readonly kind: 'fault'; readonly fault: unknown };

/** What a screen shows: the value it asked for, or what stands instead. */
export type Shown<Value> =
  Unanswered | { readonly kind: 'answered'; readonly value: Value };

/** An answer of the service as a screen reads it: a value or a refusal. */
type Reply<Value> =
  | { readonly outcome: 'answered'; readonly value: Value }
  | { readonly outcome: 'refused'; readonly error: ErrorBody };

/**
 * What a screen shows of a request it repeats. A service that does not
 * answer leaves the last answer standing, not fresh, so the screen says
 * which failure that is; any other fault is shown in place of the answer.
 */
export function shownOf<Value>(
  { answer, failure }: RepeatedRequest<Reply<Value>>,
  isUnreachable: (failure: unknown) => boolean,
): Shown<Value> {
  if (failure !== undefined && !isUnreachable(failure)) {
    return { kind: 'fault', fault: failure };
  }
  if (answer === undefined) {
    return { kind: 'waiting' };
  }
  return answer.outcome === 'refused'
    ? { kind: 'refused', error: answer.error }
    : { kind: 'answered', value: answer.value };
}

interface UnansweredBodyProps {
  /** The title of the panel the answer would have filled. */
  readonly title: string;
  readonly state: Unanswered;
}

/** A refusal is an expected outcome, so it warns and is not red. */
const REFUSED: StatusLook = {
  glyph: 'attention',
  word: 'refused',
  role: 'warning',
};

/** A fault is failed work of the client, so it is red. */
const FAULT: StatusLook = { glyph: 'failed', word: 'fault', role: 'danger' };

function Fault({ fault }: { readonly fault: unknown }): ReactNode {
  const error =
    fault instanceof Error ? fault : new Error(String(fault), { cause: fault });
  return (
    <ErrorDetails
      look={FAULT}
      headline="The request to the service failed."
      code={error.name}
      explanation={error.message}
      next="Check that the client and the service are of one version: coverage-autopilot doctor."
    />
  );
}

function Content({ state }: { readonly state: Unanswered }): ReactNode {
  switch (state.kind) {
    case 'waiting':
      return (
        <Text>
          <Glyph name="spinner" role="running" />{' '}
          <RoleText>Asking the service</RoleText>
        </Text>
      );
    case 'refused':
      return (
        <ErrorDetails
          look={REFUSED}
          headline={state.error.message}
          code={state.error.error}
          next="Press esc to go back."
        />
      );
    case 'fault':
      return <Fault fault={state.fault} />;
  }
}

/**
 * The body of a screen whose answer is not there: it is on its way, the
 * service refused it, or the request failed. A fault is shown and never
 * hidden behind an old answer.
 */
export function UnansweredBody({
  title,
  state,
}: UnansweredBodyProps): ReactNode {
  return (
    <Panel title={title} focused>
      <Content state={state} />
    </Panel>
  );
}
