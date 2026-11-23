import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import {
  listActionsOf,
  MOVE_HINT,
  panelActionsOf,
  type PanelPair,
} from '#hooks/list-keys';
import type { ScreenAction } from '#hooks/use-screen-actions';
import type { Selection } from '#hooks/use-selection';
import {
  filterActions,
  type Filters,
} from '#screens/improvements/improvement-filters';
import { canBeCancelled } from '#screens/improvements/improvement-words';
import type { Layout } from '#theme/widths';

/** Where the person is in the list, and how it is narrowed. */
export interface ImprovementsState {
  readonly chosen: Improvement | undefined;
  /** `owner/name` by the id of each repository, in the order of their list. */
  readonly names: ReadonlyMap<string, string>;
  readonly filters: Filters;
  readonly layout: Layout;
}

/** What the actions of the screen do. */
export interface ImprovementsWays {
  readonly selection: Selection;
  /** The list, and the panel of the chosen improvement. */
  readonly panels: PanelPair<'list' | 'details'>;
  readonly open: (improvementId: string) => void;
  /** Opens the question before a cancel of the work. */
  readonly ask: (improvement: Improvement) => void;
}

/** `enter` opens the chosen work, and `c` asks before it cancels it. */
function chosenActions(
  chosen: Improvement | undefined,
  { open, ask }: ImprovementsWays,
): ScreenAction[] {
  if (chosen === undefined) {
    return [];
  }
  const target = chosen.targetFile;
  const openIt: ScreenAction = {
    key: 'enter',
    run: () => {
      open(chosen.id);
    },
    hint: { label: 'open' },
    command: { title: 'Open this improvement', target },
  };
  const cancel: ScreenAction = {
    key: 'c',
    run: () => {
      ask(chosen);
    },
    hint: { label: 'cancel' },
    command: { title: 'Cancel this improvement', target },
  };
  return canBeCancelled(chosen) ? [openIt, cancel] : [openIt];
}

/**
 * The actions of the screen while the list has the keys, in the order the
 * footer names them. The list moves only while it has the focus; the
 * filters work from both panels.
 */
export function improvementsActions(
  state: ImprovementsState,
  ways: ImprovementsWays,
): ScreenAction[] {
  const listing = ways.panels.ring.focused === 'list';
  const moveHint = state.chosen === undefined ? undefined : MOVE_HINT;
  return [
    ...(listing ? listActionsOf(ways.selection, moveHint) : []),
    ...chosenActions(state.chosen, ways),
    ...filterActions(state.filters, {
      names: state.names,
      first: ways.selection.first,
      layout: state.layout,
    }),
    ...panelActionsOf(ways.panels, state.layout),
  ];
}
