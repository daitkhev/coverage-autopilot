import { Text } from 'ink';
import { createElement } from 'react';

import type { ShellFrame } from '#components/app-shell';
import type { KeyHandlers } from '#hooks/use-keys';
import type { TerminalSize } from '#theme/widths';

/** The size of the mock-ups, at which a screen is kept as text. */
export const WIDE: TerminalSize = { columns: 112, rows: 34 };

/** One size of each layout, at which nothing may be wider than the terminal. */
export const SIZES: readonly TerminalSize[] = [
  { columns: 80, rows: 24 },
  { columns: 96, rows: 30 },
  WIDE,
];

/** The smallest size, where one panel shows. */
export const NARROW: TerminalSize = { columns: 80, rows: 24 };

/**
 * What the app hands a screen. The header and the help are plain text
 * here, because a screen only places them. The app's keys are the test's.
 */
export function sampleFrame(
  size: TerminalSize,
  globalKeys: KeyHandlers = {},
): ShellFrame {
  return {
    size,
    title: 'coverage-autopilot',
    commands: ['coverage-autopilot list'],
    header: createElement(
      Text,
      null,
      'coverage-autopilot   Repositories   Improvements   Service',
    ),
    help: createElement(Text, null, '? help'),
    globalKeys,
  };
}
