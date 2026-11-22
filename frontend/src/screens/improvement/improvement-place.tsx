import { useState } from 'react';

import type {
  Improvement,
  PullRequest,
} from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import type { ShellFrame } from '#components/app-shell';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { type Selection, useSelection } from '#hooks/use-selection';
import { choicesOf } from '#screens/improvement/improvement-choices';
import type { OpenDialog } from '#screens/improvement/improvement-dialog';
import {
  type ImprovementActions,
  improvementKeys,
  type ImprovementKeysState,
  type ImprovementPanel,
} from '#screens/improvement/improvement-keys';
import { useNextFile } from '#screens/improvement/next-file';
import { usePullRequestLink } from '#screens/improvement/pull-request-link';
import { layoutOf } from '#theme/widths';

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
  readonly state: ImprovementKeysState;
  readonly choice: Selection;
  readonly dialog: OpenDialog | undefined;
  /** A line about what a key just did, such as that the browser started. */
  readonly notice: string | undefined;
  readonly close: () => void;
  /** Leaves the dialog and the notice behind, for other work in place. */
  readonly leave: () => void;
}

const PANELS: readonly [ImprovementPanel, ImprovementPanel] = ['work', 'facts'];

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
 * Where the person is on the screen, and the keys of the screen while no
 * dialog is open. The screen is not behind the backdrop of its own shell,
 * so it says itself that the dialog takes every key.
 */
export function usePlace(props: PlaceProps): Place {
  const { dialog, open, notice, say } = useOverlays();
  const ring = useFocusRing(PANELS);
  const choices = choicesOf({ ...props, open });
  const choice = useSelection({
    count: choices.length,
    visible: choices.length,
  });
  const link = usePullRequestLink(props.session, say);
  const nextFile = useNextFile(props.session, {
    onNotice: say,
    onFound: (target) => {
      open({ kind: 'start', target });
    },
  });
  const { pullRequest } = props.improvement;
  const state: ImprovementKeysState = {
    focused: ring.focused,
    layout: layoutOf(props.frame.size),
    improvement: props.improvement,
    choices,
    pullRequest: link === undefined ? undefined : (pullRequest ?? undefined),
  };
  const actions: ImprovementActions = {
    choice,
    focus: ring.focus,
    next: ring.next,
    ask: () => {
      open({ kind: 'cancel' });
    },
    openPatch: props.onOpenPatch,
    openPullRequest: (shown: PullRequest) => link?.(shown),
    nextFile,
    back: props.onBack,
  };
  useKeys(improvementKeys(state, actions), { active: dialog === undefined });
  const close = (): void => {
    open(undefined);
  };
  const leave = (): void => {
    close();
    say(undefined);
  };
  return { state, choice, dialog, notice, close, leave };
}
