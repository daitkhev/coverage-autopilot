import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useTerminalSize } from '#hooks/use-terminal-size';
import { press, screenOf } from '#tests/support/keys';

function Size(): ReactNode {
  const { columns, rows, layout } = useTerminalSize();
  return <Text>{`${String(columns)} x ${String(rows)} ${layout}`}</Text>;
}

type Terminal = ReturnType<typeof render>;

async function resize(
  terminal: Terminal,
  columns: number,
  rows: number,
): Promise<void> {
  Object.defineProperty(terminal.stdout, 'columns', {
    value: columns,
    configurable: true,
  });
  Object.defineProperty(terminal.stdout, 'rows', {
    value: rows,
    configurable: true,
  });
  terminal.stdout.emit('resize');
  await press(terminal);
}

afterEach(cleanup);

describe('useTerminalSize', () => {
  it('should give the size and the layout of the terminal', async () => {
    const terminal = render(<Size />);

    await resize(terminal, 112, 34);

    expect(screenOf(terminal)).toBe('112 x 34 wide');
  });

  describe('when the terminal is resized', () => {
    it('should redraw with the new layout', async () => {
      const terminal = render(<Size />);
      await resize(terminal, 112, 34);

      await resize(terminal, 60, 16);

      expect(screenOf(terminal)).toBe('60 x 16 too-small');
    });
  });
});
