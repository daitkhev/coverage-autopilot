import type { KeyHandlers } from '#hooks/use-keys';
import type { Selection } from '#hooks/use-selection';

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
