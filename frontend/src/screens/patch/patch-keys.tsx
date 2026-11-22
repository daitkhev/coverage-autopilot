import { backAction } from '#components/bare-screen';
import { panelActionsOf, type PanelPair } from '#hooks/list-keys';
import type { ScreenAction } from '#hooks/use-screen-actions';
import { type Decision, DECISIONS } from '#screens/patch/patch-decision';
import type { Layout } from '#theme/widths';

/** The two panels of the screen: the patch, and the evidence for it. */
export type PatchPanel = 'patch' | 'evidence';

/** What the actions of the screen act on. */
export interface PatchKeysState {
  readonly layout: Layout;
  /** The question of review mode is on the screen. */
  readonly asking: boolean;
  readonly files: number;
}

/** How the patch moves: by lines, by pages, to an end, or to a file. */
export interface Scroll {
  readonly by: (lines: number) => void;
  readonly page: (pages: number) => void;
  readonly first: () => void;
  readonly last: () => void;
  readonly file: (by: number) => void;
}

/** What the actions of the screen do. */
export interface PatchActions {
  readonly scroll: Scroll;
  readonly choose: (by: number) => void;
  readonly pick: (answer: number) => void;
  readonly confirm: () => void;
  readonly panels: PanelPair<PatchPanel>;
  readonly back: () => void;
}

/** What the list of commands calls the pick of an answer, if anything. */
const PICKED: Readonly<Record<Decision, string | undefined>> = {
  later: undefined,
  approve: 'Choose to approve the patch',
  reject: 'Choose to reject the patch',
};

function scrollActions(
  state: PatchKeysState,
  { scroll }: PatchActions,
): ScreenAction[] {
  return [
    {
      key: 'pgdn',
      run: () => {
        scroll.page(1);
      },
      ...(state.asking ? { hint: { label: 'scroll' } } : {}),
    },
    {
      key: 'j',
      run: () => {
        scroll.by(1);
      },
    },
    {
      key: 'k',
      run: () => {
        scroll.by(-1);
      },
    },
    {
      key: 'pgup',
      run: () => {
        scroll.page(-1);
      },
    },
    { key: 'g', run: scroll.first },
    { key: 'G', run: scroll.last },
  ];
}

/** `[` and `]` move between the files of a patch that has more than one. */
function fileActions(
  state: PatchKeysState,
  { scroll }: PatchActions,
): ScreenAction[] {
  if (state.files <= 1) {
    return [];
  }
  return [
    {
      key: '[',
      run: () => {
        scroll.file(-1);
      },
      hint: { key: '[ ]', label: 'file' },
      command: { title: 'Show the previous file' },
    },
    {
      key: ']',
      run: () => {
        scroll.file(1);
      },
      command: { title: 'Show the next file' },
    },
  ];
}

/** A digit picks an answer of the question, and only `enter` confirms it. */
function answerActions(actions: PatchActions): ScreenAction[] {
  return [
    ...DECISIONS.map((decision, answer): ScreenAction => {
      const title = PICKED[decision];
      return {
        key: String(answer + 1),
        run: () => {
          actions.pick(answer);
        },
        ...(title === undefined ? {} : { command: { title } }),
      };
    }),
    {
      key: 'enter',
      run: actions.confirm,
      hint: { label: 'confirm' },
      command: { title: 'Confirm the chosen answer' },
    },
  ];
}

/** While the question shows the arrows choose an answer; else they scroll. */
function arrowActions(
  state: PatchKeysState,
  actions: PatchActions,
): ScreenAction[] {
  const move = state.asking ? actions.choose : actions.scroll.by;
  return [
    {
      key: 'up',
      run: () => {
        move(-1);
      },
      hint: { key: 'up-down', label: state.asking ? 'choose' : 'scroll' },
    },
    {
      key: 'down',
      run: () => {
        move(1);
      },
    },
    ...(state.asking ? answerActions(actions) : []),
  ];
}

/** `esc` goes back; while the question shows that decides later. */
function laterAction(
  state: PatchKeysState,
  actions: PatchActions,
): ScreenAction {
  const back = backAction(actions.back);
  return state.asking
    ? { ...back, hint: { label: 'later' }, command: { title: 'Decide later' } }
    : back;
}

/** The actions of the screen, in the order the footer names them. */
export function patchActions(
  state: PatchKeysState,
  actions: PatchActions,
): ScreenAction[] {
  return [
    ...arrowActions(state, actions),
    ...scrollActions(state, actions),
    ...fileActions(state, actions),
    ...panelActionsOf(actions.panels, state.layout),
    laterAction(state, actions),
  ];
}
