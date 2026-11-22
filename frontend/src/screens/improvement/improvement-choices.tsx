import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import { backAction } from '#components/bare-screen';
import type { NamedAction } from '#hooks/use-screen-actions';
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
 * a cause that more attempts, tokens or minutes do not remove. The step
 * has no key of its own: it is chosen from its list.
 */
function againActions(failed: Failed): NamedAction[] {
  return failed.improvement.failure?.reason === 'budget_exhausted'
    ? [
        {
          run: () => {
            failed.open(againOf(failed));
          },
          command: { title: 'Request it again with larger limits' },
        },
      ]
    : [];
}

/** `p` shows the patch the gate accepted, whatever became of the work. */
function patchActions({
  improvement,
  onOpenPatch,
}: Pick<Failed, 'improvement' | 'onOpenPatch'>): NamedAction[] {
  const accepted = acceptedOf(improvement);
  return accepted === undefined
    ? []
    : [
        {
          key: 'p',
          run: () => {
            onOpenPatch(improvement.id);
          },
          command: {
            title: `Show the patch of attempt ${String(accepted.number)}`,
          },
        },
      ];
}

/**
 * What a failed improvement offers among its next steps, each an action
 * of the screen: to ask for it again with larger limits when the budget
 * ran out, its patch when one passed, and the way back.
 */
export interface Steps {
  readonly again: readonly NamedAction[];
  readonly patch: readonly NamedAction[];
  readonly back: NamedAction;
  /** The steps as their list shows them. Work that did not fail has none. */
  readonly choices: readonly Choice[];
}

function choicesOf(steps: readonly NamedAction[]): Choice[] {
  return steps.map(({ run, command }) => ({ label: command.title, run }));
}

/** The actions of the next steps, and the list a failure shows them in. */
export function stepsOf(failed: Failed): Steps {
  const hasFailed = failed.improvement.status === 'failed';
  const again = hasFailed ? againActions(failed) : [];
  const patch = patchActions(failed);
  const back = backAction(failed.onBack);
  return {
    again,
    patch,
    back,
    choices: hasFailed ? choicesOf([...again, ...patch, back]) : [],
  };
}
