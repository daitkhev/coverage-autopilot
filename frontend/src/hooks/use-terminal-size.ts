import { useWindowSize } from 'ink';

import { type Layout, layoutOf, type TerminalSize } from '#theme/widths';

export interface TerminalLayout extends TerminalSize {
  readonly layout: Layout;
}

/** The size of the terminal and its layout. It redraws on a change. */
export function useTerminalSize(): TerminalLayout {
  const { columns, rows } = useWindowSize();
  return { columns, rows, layout: layoutOf({ columns, rows }) };
}
