import {
  listActionsOf,
  MOVE_HINT,
  panelActionsOf,
  type PanelPair,
} from '#hooks/list-keys';
import type { ScreenAction } from '#hooks/use-screen-actions';
import type { Selection } from '#hooks/use-selection';
import type { RepositoryRow } from '#screens/repositories/repository-listing';
import { isScanning } from '#screens/repositories/repository-words';
import { repositoryName } from '#theme/names';
import type { Layout } from '#theme/widths';

/** What the actions of the screen act on. */
export interface RepositoriesState {
  readonly chosen: RepositoryRow | undefined;
  /** The repositories whose scan was started here, not yet in the list. */
  readonly starting: ReadonlySet<string>;
  readonly layout: Layout;
}

/** What the actions of the screen do. */
export interface RepositoriesWays {
  readonly selection: Selection;
  /** The list, and the panel of the chosen repository. */
  readonly panels: PanelPair<'list' | 'details'>;
  /** Opens the dialog that connects a repository. */
  readonly connect: () => void;
  readonly scan: (repositoryId: string) => void;
  readonly openFiles: (repositoryId: string) => void;
}

/** `enter` opens the files of the chosen repository; `s` scans it, once. */
function chosenActions(
  { chosen, starting }: RepositoriesState,
  ways: RepositoriesWays,
): ScreenAction[] {
  if (chosen === undefined) {
    return [];
  }
  const { id } = chosen.repository;
  const target = repositoryName(chosen.repository);
  const open: ScreenAction = {
    key: 'enter',
    run: () => {
      ways.openFiles(id);
    },
    hint: { label: 'open' },
    command: { title: 'Open its files', target },
  };
  const scan: ScreenAction = {
    key: 's',
    run: () => {
      ways.scan(id);
    },
    hint: { label: 'scan' },
    command: { title: 'Scan this repository', target },
  };
  return isScanning(chosen, starting) ? [open] : [open, scan];
}

/**
 * The actions of the screen while no dialog is open, in the order the
 * footer names them. The list moves only while it has the focus.
 */
export function repositoryActions(
  state: RepositoriesState,
  ways: RepositoriesWays,
): ScreenAction[] {
  const listing = ways.panels.ring.focused === 'list';
  const moveHint = state.chosen === undefined ? undefined : MOVE_HINT;
  return [
    ...(listing ? listActionsOf(ways.selection, moveHint) : []),
    ...chosenActions(state, ways),
    {
      key: 'a',
      run: ways.connect,
      hint: { label: 'add' },
      command: { title: 'Connect a repository' },
    },
    ...panelActionsOf(ways.panels, state.layout),
  ];
}
