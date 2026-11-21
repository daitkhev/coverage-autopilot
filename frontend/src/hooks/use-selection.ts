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

/**
 * Keeps the chosen row on the screen, and moves the first drawn row no
 * further than that. A list that shrinks keeps the chosen row inside it.
 */
export function positionOf(
  wanted: ListPosition,
  { count, visible }: ListSize,
): ListPosition {
  const index = clamp(wanted.index, 0, count - 1);
  const rows = Math.max(visible, 1);
  const offset = clamp(wanted.offset, index - rows + 1, index);
  return { index, offset: clamp(offset, 0, count - rows) };
}

/**
 * The selection and the scroll position of a list. It is state of its
 * own, so a change of width or of the rows keeps both.
 */
export function useSelection(size: ListSize): Selection {
  const [wanted, setWanted] = useState<ListPosition>({ index: 0, offset: 0 });
  const position = positionOf(wanted, size);
  const moveTo = (index: number): void => {
    setWanted(positionOf({ index, offset: position.offset }, size));
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
      moveTo(0);
    },
    last: () => {
      moveTo(size.count - 1);
    },
  };
}
