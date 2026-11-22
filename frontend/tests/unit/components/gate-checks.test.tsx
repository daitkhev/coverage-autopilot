import { describe, expect, it } from 'vitest';

import {
  checkWordsOf,
  type GateCheck,
  GateChecks,
} from '#components/gate-checks';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const CHECKS: readonly GateCheck[] = [
  { name: 'test_files_only', status: 'passed', time: '0.2s' },
  { name: 'type_check', status: 'error' },
  { name: 'repeated_runs', status: 'running', time: 'run 2 of 3' },
  { name: 'coverage_increase', status: 'skipped' },
  { name: 'mutation_gain', status: 'pending' },
];

function draw(columns = USUAL_COLUMNS, colour = true): string {
  return drawnAt(
    drawnWith({ animation: false, colour }, <GateChecks checks={CHECKS} />),
    columns,
  );
}

describe('GateChecks', () => {
  it('should draw every check with its symbol, words and time', () => {
    expect(draw()).toMatchSnapshot();
  });

  describe('when colour is off', () => {
    it('should still show every status as a symbol and a word', () => {
      const drawn = draw(USUAL_COLUMNS, false);

      expect(drawn).toContain('✓ only test files changed');
      expect(drawn).toContain('! project type-checks');
      expect(drawn).toContain('– coverage of the file went up');
      expect(drawn).toContain('○ mutants detected');
    });
  });

  describe('checkWordsOf', () => {
    it('should say a check in plain words', () => {
      expect(checkWordsOf('existing_tests_pass')).toBe(
        'earlier tests still pass',
      );
    });

    it('should say a code that names no check as it is', () => {
      expect(checkWordsOf('mutation_baseline')).toBe('mutation baseline');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(draw(columns))).toBeLessThanOrEqual(columns);
  });
});
