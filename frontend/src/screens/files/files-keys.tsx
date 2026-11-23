import type {
  FileCoverage,
  MeasuredFile,
} from '@coverage-autopilot/api-contracts/snapshots';

import { backAction } from '#components/bare-screen';
import {
  listActionsOf,
  MOVE_HINT,
  panelActionsOf,
  type PanelPair,
} from '#hooks/list-keys';
import type { ScreenAction } from '#hooks/use-screen-actions';
import type { Selection } from '#hooks/use-selection';
import { fileListAt, listAfter } from '#screens/files/files-answer';
import type { Layout } from '#theme/widths';

/** The two panels of the screen. */
export type FilesPanel = 'list' | 'details';

/** What the actions of the screen act on. */
export interface FilesKeysState {
  readonly layout: Layout;
  /** The place of the chosen list among the four. */
  readonly list: number;
  readonly selected: FileCoverage | undefined;
}

/** What the actions of the screen do. */
export interface FilesActions {
  readonly selection: Selection;
  readonly panels: PanelPair<FilesPanel>;
  readonly showList: (by: number) => void;
  readonly filter: () => void;
  readonly openWork: (improvementId: string) => void;
  readonly improve: (file: MeasuredFile) => void;
  readonly back: () => void;
}

/** The chosen file when it has numbers, so it can be improved. */
function measuredOf(state: FilesKeysState): MeasuredFile | undefined {
  return state.selected?.state === 'measured' ? state.selected : undefined;
}

/**
 * `enter` opens the latest work of the chosen file, when it has some, and
 * `i` improves a file that has numbers. Both work from either panel.
 */
function fileActions(
  state: FilesKeysState,
  actions: FilesActions,
): ScreenAction[] {
  const measured = measuredOf(state);
  if (measured === undefined) {
    return [];
  }
  const work = measured.latestImprovement;
  const target = measured.path;
  const improve: ScreenAction = {
    key: 'i',
    run: () => {
      actions.improve(measured);
    },
    hint: { label: 'improve' },
    command: { title: 'Improve this file', target },
  };
  return work === null
    ? [improve]
    : [
        {
          key: 'enter',
          run: () => {
            actions.openWork(work.id);
          },
          hint: { label: 'open' },
          command: { title: 'Open its improvement', target },
        },
        improve,
      ];
}

/** The name of the list a step from the chosen one leads to. */
function listName(state: FilesKeysState, by: number): string {
  return fileListAt(listAfter(state.list, by)).label;
}

/**
 * `[` and `]` choose which files the list shows, and `/` filters them.
 * At 80 columns the footer leaves them to the help, so its line fits.
 */
function choiceActions(
  state: FilesKeysState,
  actions: FilesActions,
): ScreenAction[] {
  const named = state.layout !== 'narrow';
  return [
    {
      key: '[',
      run: () => {
        actions.showList(-1);
      },
      ...(named ? { hint: { key: '[ ]', label: 'list' } } : {}),
      command: { title: 'Show the previous list', target: listName(state, -1) },
    },
    {
      key: ']',
      run: () => {
        actions.showList(1);
      },
      command: { title: 'Show the next list', target: listName(state, 1) },
    },
    {
      key: '/',
      run: actions.filter,
      ...(named ? { hint: { label: 'filter' } } : {}),
      command: { title: 'Filter the files by path' },
    },
  ];
}

/**
 * The actions of the screen, in the order the footer names them. The list
 * moves, changes and filters only while it has the focus.
 */
export function filesActions(
  state: FilesKeysState,
  actions: FilesActions,
): ScreenAction[] {
  const listing = actions.panels.ring.focused === 'list';
  return [
    ...(listing ? listActionsOf(actions.selection, MOVE_HINT) : []),
    ...fileActions(state, actions),
    ...(listing ? choiceActions(state, actions) : []),
    ...panelActionsOf(actions.panels, state.layout),
    backAction(actions.back),
  ];
}
