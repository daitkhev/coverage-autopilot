import { Box, Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CommandPalette,
  type PaletteCommand,
} from '#components/command-palette';
import type { KeyHint } from '#components/key-hints';
import { KEYS, press, screenOf } from '#tests/support/keys';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const COMMANDS: readonly PaletteCommand[] = [
  { title: 'Scan this repository', target: 'example/payments', key: 's' },
  { title: 'Scan every repository', target: '5 repositories', key: 'S' },
  { title: 'Cancel the running scan', target: 'example/gateway' },
  { title: 'Add a repository', key: 'a' },
];

const HINTS: readonly KeyHint[] = [
  { key: 'up-down', label: 'choose' },
  { key: 'enter', label: 'run' },
  { key: 'esc', label: 'close' },
];

function palette(query: string): ReactNode {
  return (
    <CommandPalette
      query={query}
      commands={COMMANDS.slice(0, 3)}
      visible={5}
      hints={HINTS}
      onQuery={() => undefined}
      onRun={() => undefined}
      onClose={() => undefined}
    />
  );
}

/** The caller filters the commands, as the app will. */
function Palette(): ReactNode {
  const [query, setQuery] = useState('');
  const [ran, setRan] = useState('nothing');
  const matching = COMMANDS.filter((command) =>
    command.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Box flexDirection="column">
      <CommandPalette
        query={query}
        commands={matching}
        visible={5}
        hints={HINTS}
        onQuery={setQuery}
        onRun={(command) => {
          setRan(command.title);
        }}
        onClose={() => {
          setRan('closed');
        }}
      />
      <Text>{`ran ${ran}`}</Text>
    </Box>
  );
}

afterEach(cleanup);

describe('CommandPalette', () => {
  it('should draw the query and the commands that match it', () => {
    expect(drawnAt(palette('sca'), USUAL_COLUMNS)).toMatchSnapshot();
  });

  it('should type the query and run no command on a letter', async () => {
    const terminal = render(<Palette />);

    await press(terminal, 'c', 'a', 'x', KEYS.backspace, 'n');

    expect(screenOf(terminal)).toContain(': can');
    expect(screenOf(terminal)).toContain('Cancel the running scan');
    expect(screenOf(terminal)).not.toContain('Add a repository');
    expect(screenOf(terminal)).toContain('ran nothing');
  });

  it('should run the chosen command on enter', async () => {
    const terminal = render(<Palette />);

    await press(terminal, KEYS.down, KEYS.down, KEYS.up, KEYS.enter);

    expect(screenOf(terminal)).toContain('ran Scan every repository');
  });

  it('should run nothing when no command matches', async () => {
    const terminal = render(<Palette />);

    await press(terminal, 'z', KEYS.enter);

    expect(screenOf(terminal)).toContain('ran nothing');
  });

  it('should close on esc', async () => {
    const terminal = render(<Palette />);

    await press(terminal, KEYS.escape);

    expect(screenOf(terminal)).toContain('ran closed');
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(drawnAt(palette('scan'), columns))).toBeLessThanOrEqual(
      columns,
    );
  });
});
