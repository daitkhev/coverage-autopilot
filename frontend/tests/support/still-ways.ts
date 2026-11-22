import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { PanelPair } from '#hooks/list-keys';
import type { FocusRing } from '#hooks/use-focus-ring';
import type { ScreenAction } from '#hooks/use-screen-actions';
import type { Selection } from '#hooks/use-selection';
import { improvementsActions } from '#screens/improvements/improvements-actions';
import { repositoryActions } from '#screens/repositories/repository-actions';
import type { RepositoryRow } from '#screens/repositories/repository-listing';
import { UNNARROWED } from '#tests/support/sample-improvements';
import { layoutOf, type TerminalSize } from '#theme/widths';

/**
 * What the actions of a view drawn alone do: nothing. A test of a view
 * builds the actions its screen would hand it, for the footer they name.
 */
export function nothing(): void {
  // A view drawn alone takes no key.
}

/** A selection that stays on its row. */
export function stillSelection(index = 0): Selection {
  return {
    index,
    offset: 0,
    moveBy: nothing,
    moveTo: nothing,
    pageBy: nothing,
    first: nothing,
    last: nothing,
  };
}

/** A focus that stays on its panel. */
function stillRing<Name extends string>(focused: Name): FocusRing<Name> {
  return { focused, next: nothing, focus: nothing };
}

/** A list and its details, the focus staying where it is. */
export function stillPanels(
  focused: 'list' | 'details',
): PanelPair<'list' | 'details'> {
  return {
    ring: stillRing(focused),
    names: ['list', 'details'],
    words: ['list', 'details'],
  };
}

/** Where a person is on a view drawn alone: the row, the panel, the size. */
export interface StillPlace {
  readonly index: number;
  readonly focused: 'list' | 'details';
  readonly size: TerminalSize;
}

/** The actions the screen of the repositories hands its view. */
export function repositoryActionsAt(
  rows: readonly RepositoryRow[],
  starting: ReadonlySet<string>,
  { index, focused, size }: StillPlace,
): ScreenAction[] {
  return repositoryActions(
    { chosen: rows[index], starting, layout: layoutOf(size) },
    {
      selection: stillSelection(index),
      panels: stillPanels(focused),
      connect: nothing,
      scan: nothing,
      openFiles: nothing,
      changeThreshold: nothing,
    },
  );
}

/** The actions the screen of the improvements hands its view. */
export function improvementsActionsAt(
  improvements: readonly Improvement[],
  names: ReadonlyMap<string, string>,
  { index, focused, size }: StillPlace,
): ScreenAction[] {
  return improvementsActions(
    {
      chosen: improvements[index],
      names,
      filters: {
        ...UNNARROWED,
        choose: { status: nothing, repositoryId: nothing },
      },
      layout: layoutOf(size),
    },
    {
      selection: stillSelection(index),
      panels: stillPanels(focused),
      open: nothing,
      ask: nothing,
    },
  );
}
