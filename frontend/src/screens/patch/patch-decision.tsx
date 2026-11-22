import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';
import { type Answer, AnswerList } from '#components/answer-list';
import { Glyph } from '#components/glyph';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import type { ActionState } from '#hooks/use-action';
import { repositoryName } from '#theme/names';
import { GAP } from '#theme/widths';

/** What a person can answer. Deciding later changes nothing, so it is first. */
export type Decision = 'later' | 'approve' | 'reject';

/** The answers in the order of `DECISIONS`. */
const ANSWERS: readonly Answer[] = [
  { label: 'Decide later' },
  { label: 'Approve and open the pull request' },
  { label: 'Reject the patch and cancel the improvement', destroys: true },
];

/** The decisions in the order the question lists them. */
export const DECISIONS: readonly Decision[] = ['later', 'approve', 'reject'];

/** The frame of the panel, the question, and the line of its outcome. */
const FRAME_ROWS = 2;
const QUESTION_ROWS = 1;
const OUTCOME_ROWS = 1;

/** The rows the question takes below the panels. */
export const DECISION_ROWS =
  FRAME_ROWS + QUESTION_ROWS + ANSWERS.length + OUTCOME_ROWS;

/** A decision that was sent, and what the service answered to it. */
export interface Decided {
  readonly decision: Exclude<Decision, 'later'>;
  readonly reply: ServiceAnswer<Improvement>;
}

/** What a decision sends: the improvement, and the hash on the screen. */
interface Sent {
  readonly decision: Exclude<Decision, 'later'>;
  readonly improvementId: string;
  readonly patchHash: string;
}

/**
 * Sends a decision. An approval names the hash of the patch on the
 * screen; a refusal for another hash means the patch changed, so it is
 * loaded again before anyone approves it.
 */
export async function decide(
  api: ServiceApi,
  sent: Sent,
  reload: () => void,
): Promise<Decided> {
  const reply =
    sent.decision === 'approve'
      ? await api.approveImprovement(sent.improvementId, {
          patchHash: sent.patchHash,
        })
      : await api.cancelImprovement(sent.improvementId);
  if (
    reply.outcome === 'refused' &&
    reply.error.error === 'patch_hash_mismatch'
  ) {
    reload();
  }
  return { decision: sent.decision, reply };
}

/** Whether the service took the decision, so it cannot be sent again. */
export function wasTaken(state: ActionState<Decided>): boolean {
  return state.phase === 'ended' && state.outcome.reply.outcome === 'answered';
}

/** The patch changed while it was read: the service named another hash. */
export function wasChanged(state: ActionState<Decided>): boolean {
  return (
    state.phase === 'ended' &&
    state.outcome.reply.outcome === 'refused' &&
    state.outcome.reply.error.error === 'patch_hash_mismatch'
  );
}

function failureWords(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/** The decision on its way, or a refusal that the notice does not say. */
function Outcome({
  state,
}: {
  readonly state: ActionState<Decided>;
}): ReactNode {
  if (state.phase === 'running') {
    return (
      <Text>
        <Glyph name="spinner" role="running" />{' '}
        <RoleText>Sending your decision</RoleText>
      </Text>
    );
  }
  if (state.phase === 'failed') {
    return (
      <RoleText role="danger">{`Nothing answered the decision: ${failureWords(state.failure)}`}</RoleText>
    );
  }
  const reply = state.phase === 'ended' ? state.outcome.reply : undefined;
  return reply?.outcome !== 'refused' || wasChanged(state) ? null : (
    <Text>
      <Glyph name="attention" role="warning" />{' '}
      <RoleText role="warning">{reply.error.message}</RoleText>{' '}
      <RoleText role="secondary">{reply.error.error}</RoleText>
    </Text>
  );
}

interface DecisionPanelProps {
  readonly repository: Repository;
  readonly chosen: number;
  readonly state: ActionState<Decided>;
}

/**
 * The question of review mode. It stays below the patch while the patch
 * scrolls, and says what approving does: it opens the pull request.
 */
export function DecisionPanel({
  repository,
  chosen,
  state,
}: DecisionPanelProps): ReactNode {
  const { defaultBranch } = repository;
  return (
    <Box flexShrink={0}>
      <Panel title="Your decision" focused>
        <Box gap={GAP} justifyContent="space-between">
          <Text>
            <Glyph name="waiting" role="accent" />{' '}
            <RoleText bold>
              Approve the patch and open the pull request?
            </RoleText>
          </Text>
          <RoleText role="secondary" truncate>
            {`to ${repositoryName(repository)}, base ${defaultBranch}`}
          </RoleText>
        </Box>
        <AnswerList answers={ANSWERS} selected={chosen} focused />
        <Outcome state={state} />
      </Panel>
    </Box>
  );
}
