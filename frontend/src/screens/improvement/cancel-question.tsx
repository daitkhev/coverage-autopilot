import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { ClientSession } from '#api/client-session';
import type { ServiceAnswer } from '#api/service-api';
import type { Answer } from '#components/answer-list';
import { Dialog } from '#components/dialog';
import { Glyph } from '#components/glyph';
import type { KeyHint } from '#components/key-hints';
import { faultWords } from '#components/problem-details';
import { RoleText } from '#components/role-text';
import { type ActionState, useAction } from '#hooks/use-action';
import { countWords } from '#theme/counts';
import { DIALOG_WIDTH } from '#theme/widths';

/** The answer that changes nothing comes first, and is chosen first. */
const ANSWERS: readonly Answer[] = [
  { label: 'Keep it running' },
  { label: 'Cancel the improvement', destroys: true },
];

const KEEP = 0;

const HINTS: readonly KeyHint[] = [
  { key: 'up-down', label: 'choose' },
  { key: 'enter', label: 'confirm' },
  { key: 'esc', label: 'keep' },
];

const TOKENS = new Intl.NumberFormat('en');

type Cancelling = ActionState<ServiceAnswer<Improvement>>;

/** What the service said to the cancel, while it is not yet done. */
function Outcome({ state }: { readonly state: Cancelling }): ReactNode {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'running':
      return (
        <Text>
          <Glyph name="spinner" role="running" />{' '}
          <RoleText>Cancelling the improvement</RoleText>
        </Text>
      );
    case 'failed':
      return (
        <RoleText role="danger">{`Nothing answered the cancel: ${faultWords(state.failure)}`}</RoleText>
      );
    case 'ended':
      return state.outcome.outcome === 'refused' ? (
        <Text>
          <Glyph name="attention" role="warning" />{' '}
          <RoleText role="warning">{state.outcome.error.message}</RoleText>{' '}
          <RoleText role="secondary">{state.outcome.error.error}</RoleText>
        </Text>
      ) : null;
  }
}

interface CancelQuestionProps {
  readonly session: ClientSession;
  readonly improvement: Improvement;
  readonly onClose: () => void;
}

/**
 * The question before a cancel, which cannot be undone. It says what is
 * spent for good. The dialog closes once the service took the cancel; a
 * second `enter` while the cancel is on its way sends nothing.
 */
export function CancelQuestion({
  session,
  improvement,
  onClose,
}: CancelQuestionProps): ReactNode {
  const cancel = useAction<ServiceAnswer<Improvement>>();
  const { usage } = improvement;
  const spent = `${countWords(usage.attempts, 'attempt')} and ${TOKENS.format(usage.tokens)} tokens`;
  const confirm = (answer: number): void => {
    if (answer === KEEP) {
      onClose();
      return;
    }
    cancel.start(async () => {
      const answered = await session.api.cancelImprovement(improvement.id);
      if (answered.outcome === 'answered') {
        onClose();
      }
      return answered;
    });
  };
  return (
    <Dialog
      title="Cancel this improvement?"
      width={DIALOG_WIDTH.question}
      tone="warning"
      answers={ANSWERS}
      hints={HINTS}
      onConfirm={confirm}
      onClose={onClose}
    >
      <RoleText>{`${spent} are already spent and will not come back. Nothing will be published.`}</RoleText>
      <Box>
        <Outcome state={cancel.state} />
      </Box>
    </Dialog>
  );
}
