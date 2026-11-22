import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import { acceptedOf } from '#screens/improvement/improvement-answer';
import type { OpenDialog } from '#screens/improvement/improvement-dialog';
import type { Choice } from '#screens/improvement/improvement-ending';

/** What the next steps of a failed improvement act on. */
interface Failed {
  readonly improvement: Improvement;
  readonly repository: Repository;
  readonly open: (dialog: OpenDialog) => void;
  readonly onOpenPatch: (improvementId: string) => void;
  readonly onBack: () => void;
}

/**
 * The same file again, from the latest snapshot of its repository, with
 * the limits it had as the ones to raise.
 */
function againOf({ improvement, repository }: Failed): OpenDialog {
  return {
    kind: 'start',
    target: {
      snapshotId: repository.latestSnapshot?.id ?? improvement.sourceSnapshotId,
      filePath: improvement.targetFile,
      earlier: { ...improvement.budget, mode: improvement.mode },
    },
  };
}

/**
 * Only a spent budget is helped by larger limits. Every other failure has
 * a cause that more attempts, tokens or minutes do not remove.
 */
function againChoices(failed: Failed): Choice[] {
  return failed.improvement.failure?.reason === 'budget_exhausted'
    ? [
        {
          label: 'Request it again with larger limits',
          run: () => {
            failed.open(againOf(failed));
          },
        },
      ]
    : [];
}

function patchChoices({ improvement, onOpenPatch }: Failed): Choice[] {
  const accepted = acceptedOf(improvement);
  return accepted === undefined
    ? []
    : [
        {
          label: `Show the patch of attempt ${String(accepted.number)}`,
          run: () => {
            onOpenPatch(improvement.id);
          },
        },
      ];
}

/**
 * The next steps of a failed improvement: to ask for it again with larger
 * limits when the budget ran out, its patch when one passed, and the way
 * back. Any other improvement has none.
 */
export function choicesOf(failed: Failed): Choice[] {
  if (failed.improvement.status !== 'failed') {
    return [];
  }
  return [
    ...againChoices(failed),
    ...patchChoices(failed),
    { label: 'Go back', run: failed.onBack },
  ];
}
