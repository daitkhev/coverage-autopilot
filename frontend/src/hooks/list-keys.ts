import type { FocusRing } from '#hooks/use-focus-ring';
import type { ActionHint, ScreenAction } from '#hooks/use-screen-actions';
import type { Selection } from '#hooks/use-selection';
import type { Layout } from '#theme/widths';

/** The words of the footer for the moves through a list: `↑↓` move. */
export const MOVE_HINT: ActionHint = { key: 'up-down', label: 'move' };

/** Two panels of a screen, one of which has the focus. */
export interface PanelPair<Name extends string> {
  readonly ring: FocusRing<Name>;
  /** The first panel, and the second one that `→` opens. */
  readonly names: readonly [Name, Name];
  /** What the footer calls each of them. */
  readonly words: readonly [string, string];
}

/**
 * The keys that move through a list, as the table of keys writes them:
 * one row with the arrows or `j` and `k`, one page, the first and the
 * last row. The footer names them once, by the arrows, with the words it
 * is given.
 */
export function listActionsOf(
  selection: Selection,
  hint?: ActionHint,
): ScreenAction[] {
  const up = (): void => {
    selection.moveBy(-1);
  };
  const down = (): void => {
    selection.moveBy(1);
  };
  return [
    { key: 'up', run: up, ...(hint === undefined ? {} : { hint }) },
    { key: 'k', run: up },
    { key: 'down', run: down },
    { key: 'j', run: down },
    {
      key: 'pgup',
      run: () => {
        selection.pageBy(-1);
      },
    },
    {
      key: 'pgdn',
      run: () => {
        selection.pageBy(1);
      },
    },
    { key: 'g', run: selection.first },
    { key: 'G', run: selection.last },
  ];
}

/**
 * The way to the other panel the footer names. At 80 columns `→` opens
 * the second panel in place of the first.
 */
function panelHintOf<Name extends string>(
  { ring, names, words }: PanelPair<Name>,
  layout: Layout,
): ActionHint {
  if (ring.focused !== names[0]) {
    return { label: words[0] };
  }
  return layout === 'narrow'
    ? { key: 'right', label: words[1] }
    : { label: words[1] };
}

/**
 * The keys between two panels: `tab` gives the focus to the other one,
 * `→` opens the second and `←` goes back to the first.
 */
export function panelActionsOf<Name extends string>(
  pair: PanelPair<Name>,
  layout: Layout,
): ScreenAction[] {
  const { ring, names } = pair;
  return [
    { key: 'tab', run: ring.next, hint: panelHintOf(pair, layout) },
    {
      key: 'right',
      run: () => {
        ring.focus(names[1]);
      },
    },
    {
      key: 'left',
      run: () => {
        ring.focus(names[0]);
      },
    },
  ];
}
