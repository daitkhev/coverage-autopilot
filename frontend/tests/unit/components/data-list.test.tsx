import { Box, Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DataList, type RowState } from '#components/data-list';
import { useKeys } from '#hooks/use-keys';
import { useSelection } from '#hooks/use-selection';
import { KEYS, press, screenOf } from '#tests/support/keys';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const FILES = [
  'src/billing/invoice.ts',
  'src/billing/tax.ts',
  'src/api/webhook.ts',
  'src/api/refund.ts',
  'src/core/retry.ts',
  'src/core/money.ts',
];

function row(file: string, state: RowState): ReactNode {
  return <Text bold={state.bold}>{file}</Text>;
}

function list({
  selected = 0,
  offset = 0,
  visible = 4,
  focused = true,
}: {
  readonly selected?: number;
  readonly offset?: number;
  readonly visible?: number;
  readonly focused?: boolean;
}): ReactNode {
  return (
    <DataList
      items={FILES}
      selected={selected}
      offset={offset}
      visible={visible}
      focused={focused}
      keyOf={(file) => file}
      renderRow={row}
      header={<Text bold>File</Text>}
    />
  );
}

function Browser(): ReactNode {
  const selection = useSelection({ count: FILES.length, visible: 3 });
  useKeys(
    {
      down: () => {
        selection.moveBy(1);
      },
    },
    { active: true },
  );
  return (
    <Box width={40}>
      {list({
        selected: selection.index,
        offset: selection.offset,
        visible: 3,
      })}
    </Box>
  );
}

afterEach(cleanup);

describe('DataList', () => {
  it('should draw the rows with the chosen one marked', () => {
    expect(drawnAt(list({}), USUAL_COLUMNS)).toMatchSnapshot();
  });

  it('should draw the rows from the scroll position', () => {
    expect(drawnAt(list({ selected: 3, offset: 2 }), USUAL_COLUMNS)).toBe(
      [
        '  File',
        '  src/api/webhook.ts',
        '› src/api/refund.ts',
        '  src/core/retry.ts',
        '  src/core/money.ts',
      ].join('\n'),
    );
  });

  it('should say how many rows are below', () => {
    expect(drawnAt(list({ visible: 2 }), USUAL_COLUMNS)).toContain(
      '  4 more below',
    );
  });

  it('should move the mark with the selection', async () => {
    const terminal = render(<Browser />);

    await press(terminal, KEYS.down, KEYS.down, KEYS.down);

    expect(screenOf(terminal)).toBe(
      [
        '  File',
        '  src/billing/tax.ts',
        '  src/api/webhook.ts',
        '› src/api/refund.ts',
        '  2 more below',
      ].join('\n'),
    );
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should mark the chosen row with ASCII', () => {
      expect(
        drawnAt(
          drawnWith({ unicode: false }, list({ focused: false })),
          USUAL_COLUMNS,
        ),
      ).toContain('> src/billing/invoice.ts');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(drawnAt(list({}), columns))).toBeLessThanOrEqual(columns);
  });
});
