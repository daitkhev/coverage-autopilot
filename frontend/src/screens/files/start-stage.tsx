import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceAnswer } from '#api/service-api';
import { AccessSteps } from '#components/access-steps';
import { ErrorDetails } from '#components/error-details';
import { Glyph } from '#components/glyph';
import { faultWords } from '#components/problem-details';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import type { ActionState } from '#hooks/use-action';
import type { StartFacts } from '#screens/files/start-limits';
import { ACCESS_CHECK_STATUS } from '#theme/status';
import { GAP } from '#theme/widths';

/** Where the dialog is before anything can start. */
export type Stage =
  | { readonly kind: 'preparing' }
  | { readonly kind: 'unanswered'; readonly failure: unknown }
  | { readonly kind: 'refused'; readonly error: ErrorBody }
  | { readonly kind: 'blocked'; readonly access: AccessCheck }
  | { readonly kind: 'ready'; readonly facts: StartFacts };

/** Where the preflight is: running, failed, refused, or passed. */
export function stageOf(state: ActionState<ServiceAnswer<StartFacts>>): Stage {
  if (state.phase === 'failed') {
    return { kind: 'unanswered', failure: state.failure };
  }
  if (state.phase !== 'ended') {
    return { kind: 'preparing' };
  }
  const answer = state.outcome;
  if (answer.outcome === 'refused') {
    return { kind: 'refused', error: answer.error };
  }
  return answer.value.access.passed
    ? { kind: 'ready', facts: answer.value }
    : { kind: 'blocked', access: answer.value.access };
}

/** One line that says what went wrong, with the stable code beside it. */
function Problem({
  sentence,
  code,
}: {
  readonly sentence: string;
  readonly code?: string;
}): ReactNode {
  return (
    <Box gap={GAP} marginTop={1}>
      <Text>
        <Glyph name="attention" role="warning" />{' '}
        <RoleText role="warning">{sentence}</RoleText>
      </Text>
      {code === undefined ? null : <RoleText role="secondary">{code}</RoleText>}
    </Box>
  );
}

/** The refusal of a request, said with its sentence and its code. */
function Refusal({ error }: { readonly error: ErrorBody }): ReactNode {
  return <Problem sentence={error.message} code={error.error} />;
}

/** Something runs and the dialog waits for it. */
function Busy({ doing }: { readonly doing: string }): ReactNode {
  return (
    <Box marginTop={1}>
      <Text>
        <Glyph name="spinner" role="running" /> <RoleText>{doing}</RoleText>
      </Text>
    </Box>
  );
}

/**
 * A preflight that failed: every step, what the tool that refused said,
 * and what to do. Nothing can start until it passes.
 */
function AccessRefused({
  access,
}: {
  readonly access: AccessCheck;
}): ReactNode {
  const failed = access.steps.find((step) => step.status === 'failed');
  const output = failed?.toolOutput ?? null;
  return (
    <Box flexDirection="column">
      <Section title="READY">
        <AccessSteps steps={access.steps} />
      </Section>
      <Box marginTop={1}>
        <ErrorDetails
          look={ACCESS_CHECK_STATUS.failed}
          headline="Nothing can start until the access check passes."
          {...(output === null
            ? {}
            : { answer: { heading: 'THE TOOL SAID', text: output } })}
          next={
            failed?.message ??
            'Fix the access of the repository, then check again.'
          }
        />
      </Box>
    </Box>
  );
}

/** What became of the start: running, refused, or not answered. */
export function StartOutcome({
  state,
}: {
  readonly state: ActionState<ServiceAnswer<Improvement>>;
}): ReactNode {
  switch (state.phase) {
    case 'running':
      return <Busy doing="Starting the improvement" />;
    case 'failed':
      return (
        <Problem
          sentence={`Nothing answered the start: ${faultWords(state.failure)} Press enter to try again.`}
        />
      );
    case 'ended':
      return state.outcome.outcome === 'refused' ? (
        <Refusal error={state.outcome.error} />
      ) : null;
    case 'idle':
      return null;
  }
}

/** What the dialog shows until the preflight has passed. */
export function StageContent({
  stage,
}: {
  readonly stage: Exclude<Stage, { readonly kind: 'ready' }>;
}): ReactNode {
  switch (stage.kind) {
    case 'preparing':
      return <Busy doing="Checking the access and reading the limits" />;
    case 'unanswered':
      return (
        <Problem
          sentence={`The service did not answer: ${faultWords(stage.failure)}`}
        />
      );
    case 'refused':
      return <Refusal error={stage.error} />;
    case 'blocked':
      return <AccessRefused access={stage.access} />;
  }
}
