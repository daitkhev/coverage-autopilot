import { render } from 'ink-testing-library';
import { createElement, Fragment, type ReactElement } from 'react';

import { screenOf } from '#tests/support/keys';
import type { TerminalSize } from '#theme/widths';

type Terminal = ReturnType<typeof render>;

/**
 * A tree in a terminal of the given size. The testing library always says
 * 100 columns and no rows, and Ink cuts what is wider, so the size is set
 * on its output and Ink is told of it as a terminal tells of a resize,
 * before the tree is drawn for the first time.
 */
export function renderAt(tree: ReactElement, size: TerminalSize): Terminal {
  const terminal = render(createElement(Fragment));
  Object.defineProperty(terminal.stdout, 'columns', { value: size.columns });
  Object.defineProperty(terminal.stdout, 'rows', { value: size.rows });
  terminal.stdout.emit('resize');
  terminal.rerender(tree);
  return terminal;
}

/** The last frame as plain text, without the spaces that end its lines. */
export function frameOf(terminal: Terminal): string {
  return screenOf(terminal).replace(/ +$/gmu, '');
}
