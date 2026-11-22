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
        label="URL"
        value={value}
        active={active}
        onChange={setValue}
      />
      <Text>{log}</Text>
    </Box>
  );
}

afterEach(cleanup);

describe('TextField', () => {
  it('should draw the label, the text and the cursor', () => {
    expect(
      drawnAt(
        <TextField
          label="URL"
          value={ADDRESS}
          active
          onChange={() => undefined}
        />,
        USUAL_COLUMNS,
      ),
    ).toBe(`URL  ${ADDRESS}█`);
  });

  it('should draw no cursor while it does not take the keys', () => {
    expect(
      drawnAt(
        <TextField
          label="URL"
          value={ADDRESS}
          active={false}
          onChange={() => undefined}
        />,
        USUAL_COLUMNS,
      ),
    ).toBe(`URL  ${ADDRESS}`);
  });

  it('should type letters and run no action', async () => {
    const terminal = render(<Form active />);

    await press(terminal, 's', 'k', 'y', KEYS.backspace, 'i');

    expect(screenOf(terminal)).toBe('URL  ski█\nno action');
  });

  it('should take a pasted text at once', async () => {
    const terminal = render(<Form active />);

    await press(terminal, ADDRESS);

    expect(screenOf(terminal)).toContain(`URL  ${ADDRESS}█`);
  });

  describe('when it does not take the keys', () => {
    it('should type nothing', async () => {
      const terminal = render(<Form active={false} />);

      await press(terminal, 's');

      expect(screenOf(terminal)).toBe('URL\naction');
    });
  });

  it.each(WIDTHS)(
    'should keep the end of a long text in %i columns',
    (columns) => {
      const drawn = drawnAt(
        <TextField
          label="URL"
          value={`${ADDRESS}/${'x'.repeat(columns)}/end`}
          active
          onChange={() => undefined}
        />,
        columns,
      );

      expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
      expect(drawn).toContain('/end█');
    },
  );
});
