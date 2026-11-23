import type {
  Improvement,
  PullRequest,
} from '@coverage-autopilot/api-contracts/improvements';

import { panelActionsOf, type PanelPair } from '#hooks/list-keys';
import type { ScreenAction } from '#hooks/use-screen-actions';
import type { Selection } from '#hooks/use-selection';
import { hasEnded } from '#screens/improvement/improvement-answer';
import type { Steps } from '#screens/improvement/improvement-choices';
import type { Layout } from '#theme/widths';

/** The two panels of the screen: the work, and the facts beside it. */
export type ImprovementPanel = 'work' | 'facts';

/** What the actions of the screen act on. */
export interface ImprovementKeysState {
  readonly layout: Layout;
  readonly improvement: Improvement;
  /** The pull request `o` opens, when there is one and a browser to show it. */
  readonly pullRequest: PullRequest | undefined;
  readonly steps: Steps;
}

/** What the actions of the screen do. */
export interface ImprovementActions {
  /** The chosen next step of failed work. */
  readonly choice: Selection;
  readonly panels: PanelPair<ImprovementPanel>;
  /** Opens the question before a cancel. */
  readonly ask: () => void;
  readonly openPullRequest: (pullRequest: PullRequest) => void;
  /** Looks for the next file below the threshold, to start work on it. */
  readonly nextFile: (improvement: Improvement) => void;
}

/** Whether the next steps of failed work take the arrows and `enter`. */
function isChoosing(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): boolean {
  return (
    state.steps.choices.length > 0 && actions.panels.ring.focused === 'work'
  );
}

/** The arrows choose a next step, and `enter` takes it. */
function choiceActions(
  state: ImprovementKeysState,
  { choice }: ImprovementActions,
): ScreenAction[] {
  const by = (rows: number) => (): void => {
    choice.moveBy(rows);
  };
  return [
    { key: 'up', run: by(-1), hint: { key: 'up-down', label: 'choose' } },
    { key: 'k', run: by(-1) },
    { key: 'down', run: by(1) },
    { key: 'j', run: by(1) },
    {
      key: 'enter',
      run: () => {
        state.steps.choices[choice.index]?.run();
      },
      hint: { label: 'confirm' },
    },
  ];
}

/** `o` shows the pull request; at 80 columns the footer names it in short. */
function pullRequestActions(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): ScreenAction[] {
  const { pullRequest } = state;
  if (pullRequest === undefined) {
    return [];
  }
  const label =
    state.layout === 'narrow' ? 'pull request' : 'open the pull request';
  return [
    {
      key: 'o',
      run: () => {
        actions.openPullRequest(pullRequest);
      },
      hint: { label },
      command: {
        title: 'Open the pull request',
        target: `#${String(pullRequest.number)}`,
      },
    },
  ];
}

/**
 * After an ending `n` goes on to the next file below the threshold, and
 * before it `c` cancels the work.
 */
function endingAction(
  { improvement }: ImprovementKeysState,
  actions: ImprovementActions,
): ScreenAction {
  return hasEnded(improvement)
    ? {
        key: 'n',
        run: () => {
          actions.nextFile(improvement);
        },
        hint: { label: 'next file' },
        command: { title: 'Go on to the next file' },
      }
    : {
        key: 'c',
        run: actions.ask,
        hint: { label: 'cancel' },
        command: {
          title: 'Cancel the improvement',
          target: improvement.targetFile,
        },
      };
}

/**
 * The actions of the screen, in the order the footer names them. Both
 * panels take the letters and `tab`. While the next steps are chosen the
 * patch is one of them, so the footer does not name `p` twice.
 */
export function improvementActions(
  state: ImprovementKeysState,
  actions: ImprovementActions,
): ScreenAction[] {
  const choosing = isChoosing(state, actions);
  const { again, patch, back } = state.steps;
  return [
    ...(choosing ? choiceActions(state, actions) : []),
    ...again,
    ...pullRequestActions(state, actions),
    ...(choosing
      ? patch
      : patch.map((each) => ({ ...each, hint: { label: 'patch' } }))),
    endingAction(state, actions),
    ...panelActionsOf(actions.panels, state.layout),
    back,
  ];
}
