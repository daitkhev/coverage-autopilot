import { createElement } from 'react';

import type { ShellFrame } from '#components/app-shell';
import { KeyHints } from '#components/key-hints';
import { TabBar } from '#components/tab-bar';
import { USUAL_COLUMNS } from '#tests/support/terminal-text';
import { layoutOf, type TerminalSize } from '#theme/widths';

/** The rows of the mock-ups, which are drawn at 112 by 34. */
const MOCK_UP_ROWS = 34;

/** The widest a live terminal of the tests draws without a fault. */
const LIVE_COLUMNS = 100;

/** The size a screen is kept at, as one frame of text. */
export const USUAL_SIZE: TerminalSize = {
  columns: USUAL_COLUMNS,
  rows: MOCK_UP_ROWS,
};

/**
 * The size of a screen in a live terminal of the tests, which draws no
 * wider than 100 columns: two narrower panels.
 */
export const LIVE_SIZE: TerminalSize = {
  columns: LIVE_COLUMNS,
  rows: MOCK_UP_ROWS,
};

const SECTIONS = ['Repositories', 'Improvements', 'Service'];

/**
 * What the app hands a screen: the header with the section that is open,
 * and the help. The keys of the app are left out, so a key a test sends
 * reaches the screen alone.
 */
export function sampleFrame(size: TerminalSize, section: number): ShellFrame {
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
  };
}
