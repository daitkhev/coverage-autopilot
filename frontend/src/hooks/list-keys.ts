import type { FocusRing } from '#hooks/use-focus-ring';
import type { KeyHandlers } from '#hooks/use-keys';
import type { Selection } from '#hooks/use-selection';

/** A screen of a list on the left and the selected item on the right. */
type ListPanel = 'list' | 'details';

/**
 * The keys that move through a list, as the table of keys writes them:
 * one row with the arrows or `j` and `k`, one page, the first and the
 * last row.
 */
export function listKeysOf(selection: Selection): KeyHandlers {
  const up = (): void => {
    selection.moveBy(-1);
  };
  const down = (): void => {
    selection.moveBy(1);
  };
  return {
    up,
    k: up,
    down,
    j: down,
    pgup: () => {
      selection.pageBy(-1);
    },
    pgdn: () => {
      selection.pageBy(1);
    },
    g: selection.first,
    G: selection.last,
  };
}

/**
 * The keys of a list and its details: the list moves only while it has
 * the focus, `tab` gives the focus to the other panel, `→` opens the
 * details, which in one panel take the place of the list, and `←` goes
 * back to the list.
 */
export function browseKeysOf(
  selection: Selection,
  ring: FocusRing<ListPanel>,
): KeyHandlers {
  return {
    ...(ring.focused === 'list' ? listKeysOf(selection) : {}),
    tab: ring.next,
    right: () => {
      ring.focus('details');
    },
    left: () => {
      ring.focus('list');
    },
  };
}
