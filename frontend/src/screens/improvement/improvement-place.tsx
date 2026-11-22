import { useState } from 'react';

import type {
  Improvement,
  PullRequest,
} from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import type { ShellFrame } from '#components/app-shell';
import { useFocusRing } from '#hooks/use-focus-ring';
import { type ScreenAction, useScreenActions } from '#hooks/use-screen-actions';
import { type Selection, useSelection } from '#hooks/use-selection';
import { stepsOf } from '#screens/improvement/improvement-choices';
import type { OpenDialog } from '#screens/improvement/improvement-dialog';
import type { Choice } from '#screens/improvement/improvement-ending';
import {
  improvementActions,
  type ImprovementPanel,
} from '#screens/improvement/improvement-keys';
import { useNextFile } from '#screens/improvement/next-file';
import { usePullRequestLink } from '#screens/improvement/pull-request-link';
import { type Layout, layoutOf } from '#theme/widths';

/** What the place of the person on the screen is made from. */
interface PlaceProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly improvement: Improvement;
  readonly repository: Repository;
  readonly onOpenPatch: (improvementId: string) => void;
  readonly onBack: () => void;
}

/** Where the person is: the panel, the next step, the dialog, the notice. */
export interface Place {
  readonly focused: ImprovementPanel;
  readonly layout: Layout;
  /** The next steps of a failed improvement, empty for any other. */
  readonly choices: readonly Choice[];
  readonly choice: Selection;
  /** What the keys do while no dialog is open. */
  readonly actions: readonly ScreenAction[];
  readonly dialog: OpenDialog | undefined;
  /** A line about what a key just did, such as that the browser started. */
  readonly notice: string | undefined;
  readonly close: () => void;
  /** Leaves the dialog and the notice behind, for other work in place. */
  readonly leave: () => void;
}

const PANELS: readonly [ImprovementPanel, ImprovementPanel] = ['work', 'facts'];

/** What the footer calls the work and the facts. */
const PANEL_WORDS = ['work', 'details'] as const;

/** The dialog that is open and the notice that shows, with their setters. */
function useOverlays(): {
  readonly dialog: OpenDialog | undefined;
  readonly open: (dialog: OpenDialog | undefined) => void;
  readonly notice: string | undefined;
  readonly say: (notice: string | undefined) => void;
} {
  const [dialog, open] = useState<OpenDialog>();
  const [notice, say] = useState<string>();
  return { dialog, open, notice, say };
}

/**
 * Where the work leads on: its pull request in the browser, when there is
 * one and a browser to show it, and the next file below the threshold.
 */
function useWaysOn(
  props: PlaceProps,
  { open, say }: Pick<ReturnType<typeof useOverlays>, 'open' | 'say'>,
): {
  readonly pullRequest: PullRequest | undefined;
  readonly openPullRequest: (pullRequest: PullRequest) => void;
  readonly nextFile: (improvement: Improvement) => void;
} {
  const link = usePullRequestLink(props.session, say);
  const nextFile = useNextFile(props.session, {
    onNotice: say,
    onFound: (target) => {
      open({ kind: 'start', target });
    },
  });
  const { pullRequest } = props.improvement;
  return {
    pullRequest: link === undefined ? undefined : (pullRequest ?? undefined),
    openPullRequest: (shown) => link?.(shown),
    nextFile,
  };
}

/**
 * Where the person is on the screen, and the keys of the screen while no
 * dialog is open. The screen is not behind the backdrop of its own shell,
 * so it says itself that the dialog takes every key.
 */
export function usePlace(props: PlaceProps): Place {
  const { dialog, open, notice, say } = useOverlays();
  const ring = useFocusRing(PANELS);
  const steps = stepsOf({ ...props, open });
  const choice = useSelection({
    count: steps.choices.length,
    visible: steps.choices.length,
  });
  const { pullRequest, ...on } = useWaysOn(props, { open, say });
  const layout = layoutOf(props.frame.size);
  const actions = improvementActions(
    { layout, improvement: props.improvement, pullRequest, steps },
    {
      ...on,
      choice,
      panels: { ring, names: PANELS, words: PANEL_WORDS },
      ask: () => {
        open({ kind: 'cancel' });
      },
    },
  );
  useScreenActions(actions, { active: dialog === undefined });
  const close = (): void => {
    open(undefined);
  };
  return {
    focused: ring.focused,
    layout,
    choices: steps.choices,
    choice,
    actions,
    dialog,
    notice,
    close,
    leave: () => {
      close();
      say(undefined);
    },
  };
}
