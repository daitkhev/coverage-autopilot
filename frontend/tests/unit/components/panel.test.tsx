import { Text } from 'ink';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Panel, type PanelTone } from '#components/panel';
import { BackdropContext } from '#hooks/use-backdrop';
import {
  drawnAt,
  drawnWith,
  styledAt,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

/** Colour is forced on, so the styles of two frames can be told apart. */
vi.hoisted(() => {
  vi.stubEnv('FORCE_COLOR', '1');
});

const PANEL_COLUMNS = 40;

function panel({
  focused,
  tone,
}: {
  readonly focused: boolean;
  readonly tone?: PanelTone;
}): ReactNode {
  return (
    <Panel
      title="Repositories"
      note="5"
      focused={focused}
      {...(tone === undefined ? {} : { tone })}
    >
      <Text>example/payments</Text>
    </Panel>
  );
}

describe('Panel', () => {
  it('should draw a rounded border with the title in its top edge', () => {
    expect(drawnAt(panel({ focused: true }), PANEL_COLUMNS)).toMatchSnapshot();
  });

  it('should draw a classic frame where Unicode is missing', () => {
    expect(
      drawnAt(
        drawnWith({ unicode: false }, panel({ focused: false })),
        PANEL_COLUMNS,
      ),
    ).toBe(
      [
        '+- Repositories 5 ---------------------+',
        '| example/payments                     |',
        '+--------------------------------------+',
      ].join('\n'),
    );
  });

  it('should draw the frame of a focused panel apart from the others', () => {
    expect(styledAt(panel({ focused: true }), PANEL_COLUMNS)).not.toBe(
      styledAt(panel({ focused: false }), PANEL_COLUMNS),
    );
  });

  it('should draw a tone over the focus', () => {
    expect(
      styledAt(panel({ focused: true, tone: 'danger' }), PANEL_COLUMNS),
    ).not.toBe(styledAt(panel({ focused: true }), PANEL_COLUMNS));
  });

  it('should cut a title too long for its top edge', () => {
    const drawn = drawnAt(
      <Panel title={'src/billing/'.repeat(10)} focused={false}>
        <Text>row</Text>
      </Panel>,
      PANEL_COLUMNS,
    );

    expect(drawn.split('\n')).toHaveLength(3);
    expect(widestLine(drawn)).toBe(PANEL_COLUMNS);
  });

  describe('when it is behind a dialog', () => {
    it('should draw its frame dim', () => {
      const behind = styledAt(
        <BackdropContext value>{panel({ focused: false })}</BackdropContext>,
        PANEL_COLUMNS,
      );

      expect(behind).not.toBe(
        styledAt(panel({ focused: false }), PANEL_COLUMNS),
      );
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(
      widestLine(drawnAt(panel({ focused: true }), columns)),
    ).toBeLessThanOrEqual(columns);
  });
});
