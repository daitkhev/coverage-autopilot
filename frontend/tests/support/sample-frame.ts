import { createElement } from 'react';

import type { ShellFrame } from '#components/app-shell';
import { KeyHints } from '#components/key-hints';
import type { Freshness } from '#components/status-line';
import { TabBar } from '#components/tab-bar';
import type { KeyHandlers } from '#hooks/use-keys';
import { SAMPLE_NOW, SECOND_AGO } from '#tests/support/fake-service-api';
import { USUAL_COLUMNS, WIDTHS } from '#tests/support/terminal-text';
import { layoutOf, SMALLEST_SIZE, type TerminalSize } from '#theme/widths';

/** The rows of the mock-ups, which are drawn at 112 by 34. */
const MOCK_UP_ROWS = 34;

/** A compact terminal is taller than the smallest and lower than the mock-ups. */
const COMPACT_ROWS = 30;

const [, COMPACT_COLUMNS] = WIDTHS;

/** The size of the mock-ups, at which a screen is kept as text. */
export const WIDE: TerminalSize = {
  columns: USUAL_COLUMNS,
  rows: MOCK_UP_ROWS,
};

/** The rows of a usual terminal, which the design draws its smallest at. */
const USUAL_ROWS = 24;

/** The narrowest size, where one panel shows. */
export const NARROW: TerminalSize = {
  columns: SMALLEST_SIZE.columns,
  rows: USUAL_ROWS,
};

/** The lowest window the screens work in, such as the panel of an editor. */
export const LOW: TerminalSize = {
  columns: USUAL_COLUMNS,
  rows: SMALLEST_SIZE.rows,
};

/** One size of each layout, at which nothing may be wider than the terminal. */
export const SIZES: readonly TerminalSize[] = [
  NARROW,
  { columns: COMPACT_COLUMNS, rows: COMPACT_ROWS },
  WIDE,
];

/** The place of each section in the header, as the app orders them. */
export const SECTION = {
  repositories: 0,
  improvements: 1,
  service: 2,
} as const;

const SECTIONS = ['Repositories', 'Improvements', 'Service'];

/** An answer that came a second ago, so the screen is fresh. */
export const FRESH_ANSWER: Freshness = {
  answeredAt: SECOND_AGO,
  stale: false,
  now: SAMPLE_NOW,
};

/**
 * What the app hands a screen: the header with the section that is open,
 * and the help. The keys of the app are the test's, so a key a test sends
 * reaches the screen alone unless the test names it.
 */
export function sampleFrame(
  size: TerminalSize,
  section: number,
  globalKeys: KeyHandlers = {},
): ShellFrame {
  return {
    size,
    title: 'coverage-autopilot',
    commands: ['coverage-autopilot list', 'coverage-autopilot doctor'],
    header: createElement(TabBar, {
      title: 'coverage-autopilot',
      sections: SECTIONS,
      active: section,
      service: 'up',
      layout: layoutOf(size),
    }),
    help: createElement(KeyHints, { hints: [{ key: '?', label: 'help' }] }),
    globalKeys,
  };
}
