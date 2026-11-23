import { Text } from 'ink';
import { describe, expect, it } from 'vitest';

import { Panel } from '#components/panel';
import { SplitView } from '#components/split-view';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { type Layout, layoutOf } from '#theme/widths';

function split(layout: Layout, shown: 'left' | 'right' = 'left'): string {
  const columns = layout === 'narrow' ? 80 : USUAL_COLUMNS;
  return drawnAt(
    <SplitView
      layout={layout}
      shown={shown}
      left={
        <Panel title="Files" focused>
          <Text>src/billing/invoice.ts</Text>
        </Panel>
      }
      right={
        <Panel title="src/billing/invoice.ts" focused={false}>
          <Text>41.2% of lines</Text>
        </Panel>
      }
    />,
    columns,
  );
}

/** The cells of a line in which a panel has its right edge. */
function rightEdges(line: string): number[] {
  return [...line.matchAll(/[╮│╯]/gu)]
    .map((found) => found.index)
    .filter((cell) => cell > 0);
}

describe('SplitView', () => {
  it.each(Array.from({ length: 31 }, (_, index) => 90 + index))(
    'should close each panel in one column at %i columns',
    (columns) => {
      const [top = '', body = '', bottom = ''] = drawnAt(
        <SplitView
          layout={layoutOf({ columns, rows: 30 })}
          shown="left"
          left={
            <Panel title="Files" note="3" focused>
              <Text>src/billing/invoice.ts</Text>
            </Panel>
          }
          right={
            <Panel title="invoice.ts" focused={false}>
              <Text>41.2% of lines</Text>
            </Panel>
          }
        />,
        columns,
      ).split('\n');

      expect(rightEdges(top)).toEqual(rightEdges(bottom));
      expect(rightEdges(body).filter((_, index) => index % 2 === 0)).toEqual(
        rightEdges(top),
      );
    },
  );

  it('should draw the list and the selected item side by side', () => {
    expect(split('wide')).toMatchSnapshot();
  });

  it('should keep both panels in a compact terminal', () => {
    const [top = ''] = split('compact').split('\n');

    expect(top).toContain('Files');
    expect(top).toContain('src/billing/invoice.ts');
  });

  describe('when there is room for one panel', () => {
    it('should draw the list', () => {
      const [top = ''] = split('narrow').split('\n');

      expect(top).toContain('Files');
      expect(top).not.toContain('invoice');
    });

    it('should draw the selected item in place of the list', () => {
      const [top = ''] = split('narrow', 'right').split('\n');

      expect(top).toContain('src/billing/invoice.ts');
      expect(top).not.toContain('Files');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const layout = layoutOf({ columns, rows: 34 });
    const drawn = drawnAt(
      <SplitView
        layout={layout}
        shown="left"
        left={
          <Panel title="Files" focused>
            <Text>src/billing/invoice.ts</Text>
          </Panel>
        }
        right={
          <Panel title="Details" focused={false}>
            <Text>{'x'.repeat(200)}</Text>
          </Panel>
        }
      />,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
