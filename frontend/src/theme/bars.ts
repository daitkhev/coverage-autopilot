import type { Role } from '#theme/roles';
import type { SymbolName } from '#theme/symbols';

/**
 * A filled cell is heavy and an empty one is light, so a bar reads without
 * colour too. The tick of a threshold takes one cell of its own.
 */
export type BarPart = 'filled' | 'empty' | 'tick';

/** The symbol of a part. The empty part is a border, the tick plain text. */
export const BAR_PARTS: Readonly<
  Record<BarPart, { readonly glyph: SymbolName; readonly role?: Role }>
> = {
  filled: { glyph: 'barFilled' },
  empty: { glyph: 'barEmpty', role: 'border' },
  tick: { glyph: 'threshold', role: 'primary' },
};

/** A stretch of cells of one part. */
export interface BarRun {
  readonly part: BarPart;
  readonly length: number;
}

/** Parts of a whole, each from 0 to 1, drawn over a number of cells. */
export interface BarShape {
  readonly filled: number;
  readonly cells: number;
  readonly tick?: number;
}

const PERCENT = 100;

/** From 80% of a limit its bar turns yellow. */
const LIMIT_WARNING = 0.8;

export function fractionOfPercent(percent: number): number {
  return percent / PERCENT;
}

function cellsOf(fraction: number, cells: number): number {
  return Math.round(Math.min(Math.max(fraction, 0), 1) * cells);
}

function tickCellOf(shape: BarShape): number {
  return shape.tick === undefined
    ? -1
    : Math.min(cellsOf(shape.tick, shape.cells), shape.cells - 1);
}

function partAt(cell: number, filled: number, tick: number): BarPart {
  if (cell === tick) {
    return 'tick';
  }
  return cell < filled ? 'filled' : 'empty';
}

export function barRunsOf(shape: BarShape): BarRun[] {
  const filled = cellsOf(shape.filled, shape.cells);
  const tick = tickCellOf(shape);
  const runs: BarRun[] = [];
  for (let cell = 0; cell < shape.cells; cell += 1) {
    const part = partAt(cell, filled, tick);
    const last = runs.at(-1);
    if (last?.part === part) {
      runs[runs.length - 1] = { part, length: last.length + 1 };
    } else {
      runs.push({ part, length: 1 });
    }
  }
  return runs;
}

/** Coverage is green at or above the threshold and yellow below it. */
export function coverageRoleOf(percent: number, threshold: number): Role {
  return percent >= threshold ? 'success' : 'warning';
}

/** A limit in use is plain, yellow from 80% and red when it is spent. */
export function limitRoleOf(used: number, limit: number): Role {
  if (used >= limit) {
    return 'danger';
  }
  return used >= limit * LIMIT_WARNING ? 'warning' : 'primary';
}
