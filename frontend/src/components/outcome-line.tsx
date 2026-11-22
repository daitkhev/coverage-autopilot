import { Text } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import { Headline } from '#components/error-details';
import { Glyph } from '#components/glyph';
import { FAULT, faultWords, REFUSED } from '#components/problem-details';
import { RoleText } from '#components/role-text';
import type { Reply } from '#components/unanswered-body';
import type { ActionState } from '#hooks/use-action';

/** Something runs and the screen waits for it: `⠋ Sending your decision`. */
export function BusyLine({ doing }: { readonly doing: string }): ReactNode {
  return (
    <Text>
      <Glyph name="spinner" role="running" /> <RoleText>{doing}</RoleText>
    </Text>
  );
}

/** What the service refused with, in yellow, with its stable code beside. */
export function RefusalLine({
  error,
}: {
  readonly error: ErrorBody;
}): ReactNode {
  return (
    <Headline look={REFUSED} headline={error.message} code={error.error} />
  );
}

/** A request that nothing answered, in red: `✕ Nothing answered the cancel`. */
export function FaultLine({
  sentence,
}: {
  readonly sentence: string;
}): ReactNode {
  return <Headline look={FAULT} headline={sentence} />;
}

/**
 * What became of a request a key sent, while it is not done: on its way,
 * not answered, or refused. An answer shows nothing, since what sent the
 * request acts on it.
 */
export function ReplyOutcome<Value>({
  state,
  doing,
  request,
}: {
  readonly state: ActionState<Reply<Value>>;
  /** What runs, as `Cancelling the improvement`. */
  readonly doing: string;
  /** What nothing answered, as `the cancel`. */
  readonly request: string;
}): ReactNode {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'running':
      return <BusyLine doing={doing} />;
    case 'failed':
      return (
        <FaultLine
          sentence={`Nothing answered ${request}: ${faultWords(state.failure)}`}
        />
      );
    case 'ended':
      return state.outcome.outcome === 'refused' ? (
        <RefusalLine error={state.outcome.error} />
      ) : null;
  }
}
