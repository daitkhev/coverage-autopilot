import type { KeyHint } from '#components/key-hints';
import type { KeyHandlers } from '#hooks/use-keys';
import { DECISIONS } from '#screens/patch/patch-decision';
import type { Layout } from '#theme/widths';

/** The two panels of the screen: the patch, and the evidence for it. */
export type PatchPanel = 'patch' | 'evidence';

/** What the keys of the screen act on. */
export interface PatchKeysState {
  readonly focused: PatchPanel;
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

/** What the keys of the screen do. */
export interface PatchActions {
  readonly scroll: Scroll;
  readonly choose: (by: number) => void;
  readonly pick: (answer: number) => void;
  readonly confirm: () => void;
  readonly focus: (panel: PatchPanel) => void;
  readonly next: () => void;
  readonly back: () => void;
}

function scrollKeys({ scroll }: PatchActions): KeyHandlers {
  return {
    j: () => {
      scroll.by(1);
    },
    k: () => {
      scroll.by(-1);
    },
    pgdn: () => {
      scroll.page(1);
    },
    pgup: () => {
      scroll.page(-1);
    },
    g: scroll.first,
    G: scroll.last,
  };
}

/** `[` and `]` move between the files of a patch that has more than one. */
function fileKeys(
  state: PatchKeysState,
  { scroll }: PatchActions,
): KeyHandlers {
  return state.files > 1
    ? {
        '[': () => {
          scroll.file(-1);
        },
        ']': () => {
          scroll.file(1);
        },
      }
    : {};
}

/**
 * While the question shows, the arrows choose an answer, a digit picks
 * one and only `enter` confirms it; otherwise the arrows scroll.
 */
function arrowKeys(state: PatchKeysState, actions: PatchActions): KeyHandlers {
  const move = state.asking ? actions.choose : actions.scroll.by;
  const arrows = {
    up: () => {
      move(-1);
    },
    down: () => {
      move(1);
    },
  };
  if (!state.asking) {
    return arrows;
  }
  const digits = Object.fromEntries(
    DECISIONS.map((_decision, answer) => [
      String(answer + 1),
      () => {
        actions.pick(answer);
      },
    ]),
  );
  return { ...arrows, ...digits, enter: actions.confirm };
}

/** The keys of the screen. */
export function patchKeys(
  state: PatchKeysState,
  actions: PatchActions,
): KeyHandlers {
  return {
    ...scrollKeys(actions),
    ...fileKeys(state, actions),
    ...arrowKeys(state, actions),
    tab: actions.next,
    right: () => {
      actions.focus('evidence');
    },
    left: () => {
      actions.focus('patch');
    },
    esc: actions.back,
  };
}

/** At 80 columns `→` opens the evidence in place of the patch. */
function panelHint(state: PatchKeysState): KeyHint {
  if (state.focused === 'evidence') {
    return { key: 'tab', label: 'patch' };
  }
  return state.layout === 'narrow'
    ? { key: 'right', label: 'evidence' }
    : { key: 'tab', label: 'evidence' };
}

/** The keys the footer lists: only those that work now. */
export function patchHints(state: PatchKeysState): KeyHint[] {
  const files = state.files > 1 ? [{ key: '[ ]', label: 'file' }] : [];
  if (!state.asking) {
    return [
      { key: 'up-down', label: 'scroll' },
      ...files,
      panelHint(state),
      { key: 'esc', label: 'back' },
    ];
  }
  return [
    { key: 'up-down', label: 'choose' },
    { key: 'enter', label: 'confirm' },
    { key: 'pgdn', label: 'scroll' },
    ...files,
    panelHint(state),
    { key: 'esc', label: 'later' },
  ];
}
