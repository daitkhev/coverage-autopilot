import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { type Answer, Dialog } from '#components/dialog';
import type { KeyHint } from '#components/key-hints';
import { KEYS, press, screenOf } from '#tests/support/keys';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { DIALOG_WIDTH } from '#theme/widths';

const ANSWERS: readonly Answer[] = [
  { label: 'Keep it running' },
  { label: 'Cancel the improvement', destroys: true },
];

const HINTS: readonly KeyHint[] = [
  { key: 'up-down', label: 'choose' },
  { key: 'enter', label: 'confirm' },
  { key: 'esc', label: 'keep' },
];

function question(onConfirm = (): void => undefined): ReactNode {
  return (
    <Dialog
      title="Cancel this improvement?"
      width={DIALOG_WIDTH.question}
      tone="warning"
      answers={ANSWERS}
      hints={HINTS}
      onConfirm={onConfirm}
      onClose={() => undefined}
    >
      <Text>
        Attempt 2 is being verified. 84,000 tokens are already spent and will
        not come back.
      </Text>
    </Dialog>
  );
}

function Asking(): ReactNode {
  const [said, setSaid] = useState('no answer');
  return (
    <>
      <Dialog
        title="Cancel this improvement?"
        width={DIALOG_WIDTH.question}
        answers={ANSWERS}
        hints={HINTS}
        onConfirm={(answer) => {
          setSaid(`answer ${String(answer + 1)}`);
        }}
        onClose={() => {
          setSaid('closed');
        }}
      />
      <Text>{said}</Text>
    </>
  );
}

afterEach(cleanup);

describe('Dialog', () => {
  it('should draw a question with its answers and keys', () => {
    expect(drawnAt(question(), USUAL_COLUMNS)).toMatchSnapshot();
  });

  it('should select the answer that changes nothing first', async () => {
    const terminal = render(<Asking />);

    await press(terminal, KEYS.enter);

    expect(screenOf(terminal)).toContain('answer 1');
  });

  it('should move the choice with the arrows and confirm it', async () => {
    const terminal = render(<Asking />);

    await press(terminal, KEYS.down, KEYS.enter);

    expect(screenOf(terminal)).toContain('answer 2');
  });

  it('should pick an answer by its number and wait for enter', async () => {
    const terminal = render(<Asking />);

    await press(terminal, '2');
    expect(screenOf(terminal)).toContain('no answer');
    expect(screenOf(terminal)).toContain('› 2. Cancel the improvement');

    await press(terminal, KEYS.up, '9', KEYS.enter);
    expect(screenOf(terminal)).toContain('answer 1');
  });

  it('should close with no change on esc', async () => {
    const terminal = render(<Asking />);

    await press(terminal, KEYS.down, KEYS.escape);

    expect(screenOf(terminal)).toContain('closed');
  });

  describe('when it is a form', () => {
    it('should confirm with enter', async () => {
      let confirmed = -1;
      const terminal = render(
        <Dialog
          title="Connect a repository"
          width={DIALOG_WIDTH.question}
          hints={[{ key: 'enter', label: 'check' }]}
          onConfirm={(answer) => {
            confirmed = answer;
          }}
          onClose={() => undefined}
        />,
      );

      await press(terminal, KEYS.down, KEYS.enter);

      expect(confirmed).toBe(0);
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(drawnAt(question(), columns))).toBeLessThanOrEqual(
      columns,
    );
  });
});
