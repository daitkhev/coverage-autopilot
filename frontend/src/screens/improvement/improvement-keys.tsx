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
  /** Looks for the next file below the threshold, to start work on it. */
  readonly nextFile: (improvement: Improvement) => void;
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
 * After an ending `n` goes on to the next file below the threshold, and
 * before it `c` cancels the work.
 */
function endedKeys(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): KeyHandlers {
  const { improvement } = state;
  return hasEnded(improvement)
    ? {
        n: () => {
          actions.nextFile(improvement);
        },
      }
    : { c: actions.ask };
}

/** `p` opens a patch the gate accepted; `o` shows its pull request. */
function letterKeys(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): KeyHandlers {
  const { improvement, pullRequest } = state;
  return {
    ...endedKeys(state, actions),
    ...(pullRequest === undefined
      ? {}
      : {
          o: () => {
            actions.openPullRequest(pullRequest);
          },
        }),
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

/** At 80 columns the address of the pull request is named in short. */
function pullRequestHints(state: ImprovementKeysState): KeyHint[] {
  if (state.pullRequest === undefined) {
    return [];
  }
  const label =
    state.layout === 'narrow' ? 'pull request' : 'open the pull request';
  return [{ key: 'o', label }];
}

/** Whether the next steps of a failed improvement take the arrows. */
function isChoosing(state: ImprovementKeysState): boolean {
  return state.choices.length > 0 && state.focused === 'work';
}

/**
 * The letters the footer lists. While the next steps are chosen, the
 * patch is one of them, so `p` is not named twice.
 */
function letterHints(state: ImprovementKeysState): KeyHint[] {
  const { improvement } = state;
  const patch = acceptedOf(improvement) !== undefined && !isChoosing(state);
  return [
    ...pullRequestHints(state),
    ...(patch ? [{ key: 'p', label: 'patch' }] : []),
    hasEnded(improvement)
      ? { key: 'n', label: 'next file' }
      : { key: 'c', label: 'cancel' },
  ];
}

/** The keys the footer lists: only those that work now. */
export function improvementHints(state: ImprovementKeysState): KeyHint[] {
  return [
    ...(isChoosing(state)
      ? [
          { key: 'up-down', label: 'choose' },
          { key: 'enter', label: 'confirm' },
        ]
      : []),
    ...letterHints(state),
    panelHint(state),
    { key: 'esc', label: 'back' },
  ];
}
