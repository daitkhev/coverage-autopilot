import { describe, expect, it } from 'vitest';

import { Timeline, type TimelineStep } from '#components/timeline';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { ATTEMPT_VERDICT, CHECK_STATUS } from '#theme/status';

const STILL = { animation: false };

const CHECKS: readonly TimelineStep[] = [
  {
    id: 'scope',
    look: CHECK_STATUS.passed,
    title: 'only test files changed',
    time: '0.2s',
    done: true,
  },
  {
    id: 'repeat',
    look: CHECK_STATUS.running,
    title: 'new tests pass on repeated runs',
    time: 'run 2 of 3',
    done: false,
  },
  {
    id: 'mutants',
    look: CHECK_STATUS.pending,
    title: 'mutants detected',
    done: false,
  },
];

const STEPS: readonly TimelineStep[] = [
  {
    id: 'analyze',
    look: CHECK_STATUS.passed,
    title: 'Analyzing',
    time: '1m 12s',
    done: true,
    results: [{ text: 'lines 41.2% · 14 mutants no test detects' }],
  },
  {
    id: 'attempt-1',
    look: ATTEMPT_VERDICT.rejected,
    title: 'Attempt 1',
    note: 'rejected',
    time: '4m 03s',
    done: true,
    results: [
      { text: 'the new tests detect 0 of 14 mutants' },
      { text: 'the reasons went to the generator' },
    ],
  },
  {
    id: 'attempt-2',
    look: CHECK_STATUS.running,
    title: 'Attempt 2',
    note: 'verifying',
    time: '5m 41s',
    done: false,
    results: [
      {
        text: 'first run of the checks timed out, same patch runs again',
        role: 'warning',
      },
    ],
    details: <Timeline steps={CHECKS} variant="checks" />,
  },
  {
    id: 'publish',
    look: CHECK_STATUS.pending,
    title: 'Publishing',
    note: 'waits for your approval',
    done: false,
  },
];

function draw(variant: 'line' | 'history', columns = USUAL_COLUMNS): string {
  return drawnAt(
    drawnWith(STILL, <Timeline steps={STEPS} variant={variant} />),
    columns,
  );
}

describe('Timeline', () => {
  it('should draw the history with the result of each step below it', () => {
    expect(draw('history', 60)).toMatchSnapshot();
  });

  it('should join the steps of the line heavy behind and light ahead', () => {
    expect(draw('line')).toBe(
      '✓ Analyzing ━━ ✕ Attempt 1 ━━ ⠋ Attempt 2 ── ○ Publishing',
    );
  });

  it.each(WIDTHS)('should fit the history in %i columns', (columns) => {
    expect(widestLine(draw('history', columns))).toBeLessThanOrEqual(columns);
  });

  it.each(WIDTHS)('should fit the line in %i columns', (columns) => {
    expect(widestLine(draw('line', columns))).toBeLessThanOrEqual(columns);
  });
});
