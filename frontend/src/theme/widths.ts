/** The size of the terminal in cells. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * Two panels from 110 columns, two narrower ones from 90, one panel from
 * 80, and below 80 by 24 a message that asks for more room.
 */
export type Layout = 'wide' | 'compact' | 'narrow' | 'too-small';

const WIDE_COLUMNS = 110;
const COMPACT_COLUMNS = 90;
export const SMALLEST_SIZE: TerminalSize = { columns: 80, rows: 24 };

export function layoutOf(size: TerminalSize): Layout {
  if (size.columns < SMALLEST_SIZE.columns || size.rows < SMALLEST_SIZE.rows) {
    return 'too-small';
  }
  if (size.columns >= WIDE_COLUMNS) {
    return 'wide';
  }
  return size.columns >= COMPACT_COLUMNS ? 'compact' : 'narrow';
}

/** Cells between two items on one line. */
export const GAP = 2;

/** Cells between two keys of the footer. */
export const KEY_GAP = 4;

/** The cells of a bar in a list, and in the panel of details. */
export const BAR_CELLS = { list: 10, detail: 16 } as const;

/** The cells a percentage takes, as `100.0%`. */
export const PERCENT_CELLS = 6;

/** The left panel of two takes this share of the width. */
export const LEFT_PANEL_SHARE = '60%';

/** A question is narrow, the list of commands wider. Both fit in 80. */
export const DIALOG_WIDTH = { question: 56, palette: 72 } as const;
