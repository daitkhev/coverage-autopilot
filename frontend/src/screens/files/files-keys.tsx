import type {
  FileCoverage,
  ImprovementRef,
  MeasuredFile,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { KeyHint } from '#components/key-hints';
import { browseKeysOf } from '#hooks/list-keys';
import type { FocusRing } from '#hooks/use-focus-ring';
import type { KeyHandlers } from '#hooks/use-keys';
import type { Selection } from '#hooks/use-selection';
import type { Layout } from '#theme/widths';

/** The two panels of the screen. */
export type FilesPanel = 'list' | 'details';

/** What the keys of the screen act on. */
export interface FilesKeysState {
  readonly focused: FilesPanel;
  readonly layout: Layout;
  readonly selected: FileCoverage | undefined;
}

/** What the keys of the screen do. */
export interface FilesActions {
  readonly selection: Selection;
  readonly showList: (by: number) => void;
  readonly filter: () => void;
  readonly ring: FocusRing<FilesPanel>;
  readonly openWork: (improvementId: string) => void;
  readonly improve: (file: MeasuredFile) => void;
  readonly back: () => void;
}

/** The keys that choose which files the list shows. */
function choiceKeys(actions: FilesActions): KeyHandlers {
  return {
    '[': () => {
      actions.showList(-1);
    },
    ']': () => {
      actions.showList(1);
    },
    '/': actions.filter,
  };
}

/** The chosen file when it has numbers, so it can be improved. */
function measuredOf(state: FilesKeysState): MeasuredFile | undefined {
  return state.selected?.state === 'measured' ? state.selected : undefined;
}

/** The latest improvement of the chosen file, which `enter` opens. */
function workOf(state: FilesKeysState): ImprovementRef | null {
  return measuredOf(state)?.latestImprovement ?? null;
}

function fileKeys(state: FilesKeysState, actions: FilesActions): KeyHandlers {
  const measured = measuredOf(state);
  const work = workOf(state);
  return {
    ...(work === null
      ? {}
      : {
          enter: () => {
            actions.openWork(work.id);
          },
        }),
    ...(measured === undefined
      ? {}
      : {
          i: () => {
            actions.improve(measured);
          },
        }),
  };
}

/**
 * The keys of the screen. The list moves only while it has the focus; the
 * keys of the chosen file work from both panels. `enter` opens the work
 * of a file only when it has some, and `i` improves only a file that has
 * numbers.
 */
export function filesKeys(
  state: FilesKeysState,
  actions: FilesActions,
): KeyHandlers {
  return {
    ...browseKeysOf(actions.selection, actions.ring),
    ...(state.focused === 'list' ? choiceKeys(actions) : {}),
    esc: actions.back,
    ...fileKeys(state, actions),
  };
}

/** At 80 columns `→` opens the chosen file in place of the list. */
function panelHint(state: FilesKeysState): KeyHint {
  if (state.focused === 'details') {
    return { key: 'tab', label: 'list' };
  }
  return state.layout === 'narrow'
    ? { key: 'right', label: 'details' }
    : { key: 'tab', label: 'details' };
}

/**
 * The keys the footer lists: only those that work now. At 80 columns the
 * lists and the filter are left to the help, so the line fits.
 */
export function filesHints(state: FilesKeysState): KeyHint[] {
  const listing = state.focused === 'list';
  return [
    ...(listing ? [{ key: 'up-down', label: 'move' }] : []),
    ...(workOf(state) === null ? [] : [{ key: 'enter', label: 'open' }]),
    ...(measuredOf(state) === undefined
      ? []
      : [{ key: 'i', label: 'improve' }]),
    ...(listing && state.layout !== 'narrow'
      ? [
          { key: '[ ]', label: 'list' },
          { key: '/', label: 'filter' },
        ]
      : []),
    panelHint(state),
    { key: 'esc', label: 'back' },
  ];
}
