import { Box, renderToString, Text } from 'ink';
import { createElement, type ReactNode } from 'react';

import { ThemeContext } from '#hooks/use-theme';
import { FULL_THEME, type ThemeSettings } from '#theme/settings';

const ESCAPE_CODE = 27;
const ESCAPE = String.fromCharCode(ESCAPE_CODE);
const STYLE_CODE = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'gu');

/** The text a terminal shows, with the codes of colour and weight removed. */
export function plainText(text: string): string {
  return text.replace(STYLE_CODE, '');
}

const PROBE_CELLS = 8;
const PROBE_COLUMNS = 16;
const PROBE_END = '|';

/**
 * The cells a text takes, as Ink lays it out: the text sits in a box of a
 * known width, and the end mark after the box shows how much room is left.
 */
export function cellWidth(text: string): number {
  const probe = createElement(
    Box,
    null,
    createElement(
      Box,
      { width: PROBE_CELLS, flexShrink: 0 },
      createElement(Text, null, text),
    ),
    createElement(Text, null, PROBE_END),
  );
  const line = plainText(renderToString(probe, { columns: PROBE_COLUMNS }));
  return PROBE_CELLS - (line.lastIndexOf(PROBE_END) - text.length);
}

const NARROW_COLUMNS = 80;
const COMPACT_COLUMNS = 96;
const WIDE_COLUMNS = 112;

/** The widths every part is checked at, one of each layout. */
export const WIDTHS = [NARROW_COLUMNS, COMPACT_COLUMNS, WIDE_COLUMNS];

/** The width a part is kept at, as one frame of text. */
export const USUAL_COLUMNS = WIDE_COLUMNS;

/** Room around the box, so a part that is too wide shows past its width. */
const OVERFLOW_ROOM = 3;

/** A part drawn in a box of a terminal's width, with its codes of style. */
export function styledAt(element: ReactNode, columns: number): string {
  const box = createElement(
    Box,
    { width: columns, flexDirection: 'column' },
    element,
  );
  return renderToString(box, { columns: columns * OVERFLOW_ROOM });
}

/** A part drawn in a box of a terminal's width, as plain text. */
export function drawnAt(element: ReactNode, columns: number): string {
  return plainText(styledAt(element, columns)).replace(/ +$/gmu, '');
}

/** A part drawn for a terminal with the given abilities. */
export function drawnWith(
  settings: Partial<ThemeSettings>,
  element: ReactNode,
): ReactNode {
  return createElement(
    ThemeContext,
    { value: { ...FULL_THEME, ...settings } },
    element,
  );
}

const CHARACTERS = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** The cells of the widest line. Every glyph of the theme is one cell. */
export function widestLine(text: string): number {
  return Math.max(
    ...text
      .split('\n')
      .map((line) => Array.from(CHARACTERS.segment(line)).length),
  );
}
