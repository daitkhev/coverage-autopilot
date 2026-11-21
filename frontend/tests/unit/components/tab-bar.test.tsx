import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { TabBar } from '#components/tab-bar';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { layoutOf } from '#theme/widths';

const SECTIONS = ['Repositories', 'Improvements', 'Service'];

function header(columns: number, waits: 'waits' | 'idle' = 'waits'): ReactNode {
  return (
    <TabBar
      title="coverage-autopilot"
      sections={SECTIONS}
      active={1}
      service="up"
      layout={layoutOf({ columns, rows: 34 })}
      {...(waits === 'waits'
        ? { waiting: { count: 1, label: 'to review' } }
        : {})}
    />
  );
}

describe('TabBar', () => {
  it('should draw the sections, what waits and the state of the service', () => {
    expect(drawnAt(header(USUAL_COLUMNS), USUAL_COLUMNS)).toMatchSnapshot();
  });

  it('should keep only the count of what waits in a narrow terminal', () => {
    expect(drawnAt(header(80), 80)).toMatch(
      /^coverage-autopilot {2}Repositories {2}Improvements {2}Service +\? 1 {2}● service up$/u,
    );
  });

  describe('when nothing waits', () => {
    it('should carry no number', () => {
      expect(drawnAt(header(USUAL_COLUMNS, 'idle'), USUAL_COLUMNS)).not.toMatch(
        /\d/u,
      );
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(drawnAt(header(columns), columns))).toBeLessThanOrEqual(
      columns,
    );
  });
});
