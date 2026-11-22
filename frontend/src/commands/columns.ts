import { GAP } from '#theme/widths';

/** A row of a list, one cell for each column. */
export type Cells = readonly string[];

/** The cells of the label of a line: its widest label, `pull request`, and a space. */
const LABEL_CELLS = 12;

/** The width of each column: the widest of its cells. */
export function columnWidths(rows: readonly Cells[]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, column) => {
      widths[column] = Math.max(widths[column] ?? 0, cell.length);
    });
  }
  return widths;
}

/**
 * One row with each cell as wide as its column, and the columns apart by
 * spaces. An empty last cell leaves no spaces behind it.
 */
export function alignedRow(cells: Cells, widths: readonly number[]): string {
  return cells
    .map((cell, column) => cell.padEnd(widths[column] ?? 0))
    .join(' '.repeat(GAP))
    .trimEnd();
}

/** Rows aligned in columns with spaces, so a list reads without a table. */
export function alignedRows(rows: readonly Cells[]): string[] {
  const widths = columnWidths(rows);
  return rows.map((row) => alignedRow(row, widths));
}

/**
 * A label and what it says, as the lines of `--wait` in the document:
 * `attempt 1    rejected: ...`. Every label starts its text in one column.
 */
export function labelled(label: string, text: string): string {
  return `${label.padEnd(LABEL_CELLS)} ${text}`.trimEnd();
}
