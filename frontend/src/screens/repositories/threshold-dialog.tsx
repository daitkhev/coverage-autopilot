import { Box } from 'ink';
import { type ReactNode, useState } from 'react';

import type {
  Repository,
  RepositoryThreshold,
} from '@coverage-autopilot/api-contracts/repositories';

import { Dialog } from '#components/dialog';
import type { KeyHint } from '#components/key-hints';
import { ReplyOutcome } from '#components/outcome-line';
import { RoleText } from '#components/role-text';
import { TextField } from '#components/text-field';
import type { Reply } from '#components/unanswered-body';
import { useAction } from '#hooks/use-action';
import type { RepositoryDialogParts } from '#screens/repositories/use-repository-dialog';
import { percentWords } from '#theme/counts';
import { repositoryName } from '#theme/names';
import { DIALOG_WIDTH } from '#theme/widths';

/**
 * The open dialog of the threshold of one repository, and what it does.
 * A percentage of `null` gives the default back.
 */
export type ThresholdDialogParts = RepositoryDialogParts<number | null>;

/** The keys of the dialog, also for the footer. */
export const THRESHOLD_HINTS: readonly KeyHint[] = [
  { key: 'enter', label: 'save' },
  { key: 'esc', label: 'close' },
];

/** The field takes digits alone, three at most, as `100`. */
const PERCENT_TEXT = /^\d{0,3}$/u;

/** What files are judged by: `90.0% of lines, its own`. */
export function thresholdWords(threshold: RepositoryThreshold): string {
  const whose = threshold.isDefault ? 'the default of the service' : 'its own';
  return `${percentWords(threshold.percentage)} of ${threshold.metric}, ${whose}`;
}

/** The field starts at the percent of its own, or empty for the default. */
function textOf({ isDefault, percentage }: RepositoryThreshold): string {
  return isDefault ? '' : String(percentage);
}

/**
 * The threshold of one repository: a whole percent of its own, or an
 * empty field for the default of the service. Whether the percent is in
 * range is the service's to say, and its refusal stays in the dialog.
 * The dialog closes once the service took the change.
 */
export function ThresholdDialog({
  repository,
  change,
  onChanged,
  onClose,
}: ThresholdDialogParts): ReactNode {
  const [text, setText] = useState(() => textOf(repository.threshold));
  const saving = useAction<Reply<Repository>>();
  const confirm = (): void => {
    saving.start(async () => {
      const answer = await change(text === '' ? null : Number(text));
      if (answer.outcome === 'answered') {
        onChanged(answer.value);
      }
      return answer;
    });
  };
  return (
    <Dialog
      title={`Threshold of ${repositoryName(repository)}`}
      width={DIALOG_WIDTH.question}
      hints={THRESHOLD_HINTS}
      onConfirm={confirm}
      onClose={onClose}
    >
      <RoleText>{`Its files are judged by ${thresholdWords(repository.threshold)}. A file below it can be improved.`}</RoleText>
      <RoleText role="secondary">
        A whole percent from 1 to 100. Empty gives the default back.
      </RoleText>
      <Box marginTop={1}>
        <TextField
          prompt="Percent"
          value={text}
          active
          onChange={(next) => {
            if (PERCENT_TEXT.test(next)) {
              setText(next);
            }
          }}
        />
      </Box>
      <ReplyOutcome
        state={saving.state}
        doing="Saving the threshold"
        request="the threshold"
      />
    </Dialog>
  );
}
