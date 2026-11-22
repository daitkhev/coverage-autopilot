import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceAnswer } from '#api/service-api';
import { AccessSteps } from '#components/access-steps';
import { ErrorDetails } from '#components/error-details';
import { BusyLine, FaultLine, RefusalLine } from '#components/outcome-line';
import { faultWords } from '#components/problem-details';
import { Section } from '#components/section';
import type { ActionState } from '#hooks/use-action';
import type { StartFacts } from '#screens/files/start-limits';
import { ACCESS_CHECK_STATUS } from '#theme/status';

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

/** The line of an outcome stands apart from the form above it. */
function Below({ children }: { readonly children: ReactNode }): ReactNode {
  return <Box marginTop={1}>{children}</Box>;
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
      return (
        <Below>
          <BusyLine doing="Starting the improvement" />
        </Below>
      );
    case 'failed':
      return (
        <Below>
          <FaultLine
            sentence={`Nothing answered the start: ${faultWords(state.failure)} Press enter to try again.`}
          />
        </Below>
      );
    case 'ended':
      return state.outcome.outcome === 'refused' ? (
        <Below>
          <RefusalLine error={state.outcome.error} />
        </Below>
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
      return (
        <Below>
          <BusyLine doing="Checking the access and reading the limits" />
        </Below>
      );
    case 'unanswered':
      return (
        <Below>
          <FaultLine
            sentence={`The service did not answer: ${faultWords(stage.failure)}`}
          />
        </Below>
      );
    case 'refused':
      return (
        <Below>
          <RefusalLine error={stage.error} />
        </Below>
      );
    case 'blocked':
      return <AccessRefused access={stage.access} />;
  }
}
