import type {
  Improvement,
  PullRequest,
} from '@coverage-autopilot/api-contracts/improvements';

import type { KeyHint } from '#components/key-hints';
import type { KeyHandlers } from '#hooks/use-keys';
import type { Selection } from '#hooks/use-selection';
import { acceptedOf, hasEnded } from '#screens/improvement/improvement-answer';
import type { Choice } from '#screens/improvement/improvement-ending';
import type { Layout } from '#theme/widths';

/** The two panels of the screen: the work, and the facts beside it. */
export type ImprovementPanel = 'work' | 'facts';

/** What the keys of the screen act on. */
export interface ImprovementKeysState {
  readonly focused: ImprovementPanel;
  readonly layout: Layout;
  readonly improvement: Improvement;
  /** The next steps of a failed improvement, empty for any other. */
  readonly choices: readonly Choice[];
  /** The pull request `o` opens, when there is one and a browser to show it. */
  readonly pullRequest: PullRequest | undefined;
}

/** What the keys of the screen do. */
export interface ImprovementActions {
  readonly choice: Selection;
  readonly focus: (panel: ImprovementPanel) => void;
  readonly next: () => void;
  /** Opens the question before a cancel. */
  readonly ask: () => void;
  readonly openPatch: (improvementId: string) => void;
  readonly openPullRequest: (pullRequest: PullRequest) => void;
  readonly back: () => void;
}

/** The choices take the arrows and `enter` while the work has the focus. */
function choiceKeys(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): KeyHandlers {
  const { choices } = state;
  if (choices.length === 0 || state.focused !== 'work') {
    return {};
  }
  const by = (rows: number) => (): void => {
    actions.choice.moveBy(rows);
  };
  return {
    up: by(-1),
    k: by(-1),
    down: by(1),
    j: by(1),
    enter: () => {
      choices[actions.choice.index]?.run();
    },
  };
}

/**
 * `c` cancels work that still runs; `p` opens a patch the gate accepted;
 * `o` shows its pull request in the browser.
 */
function letterKeys(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): KeyHandlers {
  const { improvement, pullRequest } = state;
  return {
    ...(pullRequest === undefined
      ? {}
      : {
          o: () => {
            actions.openPullRequest(pullRequest);
          },
        }),
    ...(hasEnded(improvement) ? {} : { c: actions.ask }),
    ...(acceptedOf(improvement) === undefined
      ? {}
      : {
          p: () => {
            actions.openPatch(improvement.id);
          },
        }),
  };
}

/** The keys of the screen. Both panels take the letters and `tab`. */
export function improvementKeys(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): KeyHandlers {
  return {
    tab: actions.next,
    right: () => {
      actions.focus('facts');
    },
    left: () => {
      actions.focus('work');
    },
    esc: actions.back,
    ...letterKeys(state, actions),
    ...choiceKeys(state, actions),
  };
}

/** At 80 columns `→` opens the facts in place of the work. */
function panelHint(state: ImprovementKeysState): KeyHint {
  if (state.focused === 'facts') {
    return { key: 'tab', label: 'work' };
  }
  return state.layout === 'narrow'
    ? { key: 'right', label: 'details' }
    : { key: 'tab', label: 'details' };
}

/** The keys the footer lists: only those that work now. */
export function improvementHints(state: ImprovementKeysState): KeyHint[] {
  const { improvement } = state;
  const choosing = state.choices.length > 0 && state.focused === 'work';
  return [
    ...(choosing
      ? [
          { key: 'up-down', label: 'choose' },
          { key: 'enter', label: 'confirm' },
        ]
      : []),
    ...(state.pullRequest === undefined
      ? []
      : [{ key: 'o', label: 'open the pull request' }]),
    ...(acceptedOf(improvement) === undefined
      ? []
      : [{ key: 'p', label: 'patch' }]),
    ...(hasEnded(improvement) ? [] : [{ key: 'c', label: 'cancel' }]),
    panelHint(state),
    { key: 'esc', label: 'back' },
  ];
}
