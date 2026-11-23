import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { Answer } from '#components/answer-list';
import { Dialog } from '#components/dialog';
import type { KeyHint } from '#components/key-hints';
import { ReplyOutcome } from '#components/outcome-line';
import { RoleText } from '#components/role-text';
import type { Reply } from '#components/unanswered-body';
import { useAction } from '#hooks/use-action';
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

interface CancelQuestionProps {
  readonly improvement: Pick<Improvement, 'usage'>;
  /** The cancel the question asks before: one request for one confirmation. */
  readonly cancel: () => Promise<Reply<unknown>>;
  readonly onClose: () => void;
}

/**
 * The question before a cancel, which cannot be undone. It says what is
 * spent for good. The dialog closes once the service took the cancel; a
 * second `enter` while the cancel is on its way sends nothing.
 */
export function CancelQuestion({
  improvement,
  cancel: send,
  onClose,
}: CancelQuestionProps): ReactNode {
  const cancel = useAction<Reply<unknown>>();
  const { usage } = improvement;
  const spent = `${countWords(usage.attempts, 'attempt')} and ${TOKENS.format(usage.tokens)} tokens`;
  const confirm = (answer: number): void => {
    if (answer === KEEP) {
      onClose();
      return;
    }
    cancel.start(async () => {
      const answered = await send();
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
        <ReplyOutcome
          state={cancel.state}
          doing="Cancelling the improvement"
          request="the cancel"
        />
      </Box>
    </Dialog>
  );
}
