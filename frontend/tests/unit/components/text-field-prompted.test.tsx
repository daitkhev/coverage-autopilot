import { Box, Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TextField } from '#components/text-field-prompted';
import { KEYS, press, screenOf } from '#tests/support/keys';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

function Field({ active = true }: { readonly active?: boolean }): ReactNode {
  const [value, setValue] = useState('');
  const [said, setSaid] = useState('typing');
  return (
    <Box flexDirection="column">
      <TextField
        prompt="/"
        value={value}
        active={active}
        onChange={setValue}
        onAccept={() => {
          setSaid(`accepted ${value}`);
        }}
        onDiscard={() => {
          setSaid('discarded');
        }}
      />
      <Text>{said}</Text>
    </Box>
  );
}

function drawn({
  value,
  active,
  columns = USUAL_COLUMNS,
}: {
  readonly value: string;
  readonly active: boolean;
  readonly columns?: number;
}): string {
  return drawnAt(
    <TextField
      prompt="/"
      value={value}
      active={active}
      onChange={() => undefined}
      onAccept={() => undefined}
      onDiscard={() => undefined}
    />,
    columns,
  );
}

afterEach(cleanup);

describe('TextField', () => {
  it('should draw the prompt, the text and the cursor while it types', () => {
    expect(drawn({ value: 'invoice', active: true })).toBe('/ invoice█');
  });

  it('should draw no cursor when it does not have the keys', () => {
    expect(drawn({ value: 'invoice', active: false })).toBe('/ invoice');
  });

  it('should type letters and take one back on backspace', async () => {
    const terminal = render(<Field />);

    await press(terminal, 'b', 'i', 'l', 'x', KEYS.backspace);

    expect(screenOf(terminal)).toContain('/ bil█');
  });

  it('should accept the text on enter', async () => {
    const terminal = render(<Field />);

    await press(terminal, 'q', KEYS.enter);

    expect(screenOf(terminal)).toContain('accepted q');
  });

  it('should discard the text on esc', async () => {
    const terminal = render(<Field />);

    await press(terminal, 'a', KEYS.escape);

    expect(screenOf(terminal)).toContain('discarded');
  });

  describe('when it does not have the keys', () => {
    it('should take no letter', async () => {
      const terminal = render(<Field active={false} />);

      await press(terminal, 'a', KEYS.enter);

      expect(screenOf(terminal)).toBe('/\ntyping');
    });
  });

  it.each(WIDTHS)('should keep a long text in %i columns', (columns) => {
    const long = 'src/billing/'.repeat(20);

    expect(
      widestLine(drawn({ value: long, active: true, columns })),
    ).toBeLessThanOrEqual(columns);
  });
});
