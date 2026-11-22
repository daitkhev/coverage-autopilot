import { useState } from 'react';

/** The chosen row of a list and the first row that is drawn. */
export interface ListPosition {
  readonly index: number;
  readonly offset: number;
}

/** A list of a number of rows, of which a number fit on the screen. */
export interface ListSize {
  readonly count: number;
  readonly visible: number;
  /**
   * The key of each row, in order. The chosen row is then found by its
   * key wherever the list moved it; when it is gone, the row now at its
   * place is chosen.
   */
  readonly keys?: readonly string[];
}

/** The row a person chose: its place, and its key when the list has keys. */
interface ChosenRow extends ListPosition {
  readonly key?: string | undefined;
}

export interface Selection extends ListPosition {
  readonly moveBy: (rows: number) => void;
  readonly moveTo: (index: number) => void;
  readonly pageBy: (pages: number) => void;
  readonly first: () => void;
  readonly last: () => void;
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(Math.max(value, lowest), Math.max(lowest, highest));
}

/** Where the chosen row is now: at its key, or else at its place. */
function placeOf(
  { index, key }: ChosenRow,
  keys: readonly string[] | undefined,
): number {
  const found = key === undefined ? -1 : (keys?.indexOf(key) ?? -1);
  return found === -1 ? index : found;
}

/**
 * Keeps the chosen row on the screen, and moves the first drawn row no
 * further than that. A list that shrinks keeps the chosen row inside it,
 * at the nearest row to the one that is gone.
 */
export function positionOf(
  wanted: ChosenRow,
  { count, visible, keys }: ListSize,
): ListPosition {
  const index = clamp(placeOf(wanted, keys), 0, count - 1);
  const rows = Math.max(visible, 1);
  const offset = clamp(wanted.offset, index - rows + 1, index);
  return { index, offset: clamp(offset, 0, count - rows) };
}

/**
 * The selection and the scroll position of a list. It is state of its
 * own, so a change of width or of the rows keeps both. The first row is
 * chosen by its place and not by its key, so a list that is narrowed in
 * the same step starts at its top.
 */
export function useSelection(size: ListSize): Selection {
  const [wanted, setWanted] = useState<ChosenRow>({ index: 0, offset: 0 });
  const position = positionOf(wanted, size);
  const moveTo = (index: number): void => {
    const next = positionOf({ index, offset: position.offset }, size);
    setWanted({ ...next, key: size.keys?.[next.index] });
  };
  return {
    ...position,
    moveTo,
    moveBy: (rows) => {
      moveTo(position.index + rows);
    },
    pageBy: (pages) => {
      moveTo(position.index + pages * size.visible);
    },
    first: () => {
      setWanted({ index: 0, offset: 0 });
    },
    last: () => {
      moveTo(size.count - 1);
    },
  };
}
