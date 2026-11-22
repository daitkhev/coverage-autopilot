import { Box, Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TextField } from '#components/text-field';
import { useKeys } from '#hooks/use-keys';
import { KEYS, press, screenOf } from '#tests/support/keys';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const ADDRESS = 'https://github.com/acme/widgets';

/** A field beside a part that runs an action on `s`. */
function Form({ active }: { readonly active: boolean }): ReactNode {
  const [value, setValue] = useState('');
  const [log, setLog] = useState('no action');
  useKeys(
    {
      s: () => {
        setLog('action');
      },
    },
    { active: !active },
  );
  return (
    <Box flexDirection="column">
      <TextField
        prompt="URL"
        value={value}
        active={active}
        onChange={setValue}
      />
      <Text>{log}</Text>
    </Box>
  );
}

function drawn(
  { value, active }: { readonly value: string; readonly active: boolean },
  columns = USUAL_COLUMNS,
): string {
  return drawnAt(
    <TextField
      prompt="URL"
      value={value}
      active={active}
      onChange={() => undefined}
    />,
    columns,
  );
}

afterEach(cleanup);

describe('TextField', () => {
  it('should draw the prompt, the text and the cursor', () => {
    expect(drawn({ value: ADDRESS, active: true })).toBe(`URL ${ADDRESS}█`);
  });

  it('should draw no cursor while it does not take the keys', () => {
    expect(drawn({ value: ADDRESS, active: false })).toBe(`URL ${ADDRESS}`);
  });

  it('should type letters, take one back on backspace, and run no action', async () => {
    const terminal = render(<Form active />);

    await press(terminal, 's', 'k', 'y', KEYS.backspace, 'i');

    expect(screenOf(terminal)).toBe('URL ski█\nno action');
  });

  it('should take a pasted text at once', async () => {
    const terminal = render(<Form active />);

    await press(terminal, ADDRESS);

    expect(screenOf(terminal)).toContain(`URL ${ADDRESS}█`);
  });

  it('should leave enter and esc to what holds it', async () => {
    const terminal = render(<Form active />);

    await press(terminal, 'a', KEYS.enter, KEYS.escape);

    expect(screenOf(terminal)).toBe('URL a█\nno action');
  });

  describe('when it does not take the keys', () => {
    it('should type nothing', async () => {
      const terminal = render(<Form active={false} />);

      await press(terminal, 's');

      expect(screenOf(terminal)).toBe('URL\naction');
    });
  });

  it.each(WIDTHS)(
    'should keep the prompt and the end of a long text in %i columns',
    (columns) => {
      const text = drawn(
        { value: `${ADDRESS}/${'x'.repeat(columns)}/end`, active: true },
        columns,
      );

      expect(widestLine(text)).toBeLessThanOrEqual(columns);
      expect(text).toMatch(/^URL .*\/end█$/u);
    },
  );
});
