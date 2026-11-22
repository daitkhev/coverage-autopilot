import { describe, expect, it } from 'vitest';

import {
  publicationTextOf,
  type PublishedWork,
  shortened,
} from '#improvement/application/commands/run-improvement/publication-text';
import type { CheckName } from '#improvement/domain/value-objects/quality-policy.vo';
import {
  type CheckResult,
  type TargetCoverage,
  VerificationReport,
  type VerificationReportProps,
} from '#improvement/domain/value-objects/verification-report.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import {
  BASE_COMMIT,
  checkOf,
  reportPropsOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const HEADER_MAX_LENGTH = 72;

function coverageOf(
  covered: readonly [number, number, number, number],
  total: readonly [number, number, number, number],
): TargetCoverage {
  return {
    statements: { covered: covered[0], total: total[0] },
    branches: { covered: covered[1], total: total[1] },
    functions: { covered: covered[2], total: total[2] },
    lines: { covered: covered[3], total: total[3] },
  };
}

function checkThat(name: CheckName, status: CheckResult['status']) {
  return { ...checkOf(name, 'accepted'), status };
}

function workOf(
  changes: Partial<VerificationReportProps> = {},
  file = TARGET_FILE,
): PublishedWork {
  return {
    targetFile: FilePath.create(file),
    baseCommit: CommitSha.create(BASE_COMMIT),
    report: VerificationReport.create({
      ...reportPropsOf('accepted'),
      ...changes,
    }),
  };
}

describe('publicationTextOf', () => {
  describe('the header', () => {
    it('should cover the file as a test commit, for the commit and the title', () => {
      const text = publicationTextOf(workOf());

      expect(text.commitMessage).toBe('test: cover src/price.ts');
      expect(text.title).toBe(text.commitMessage);
    });

    it('should give a long path up for the name of the file', () => {
      const deep = `packages/${'nested/'.repeat(10)}price.ts`;

      const text = publicationTextOf(workOf({}, deep));

      expect(text.title).toBe('test: cover price.ts');
    });

    it('should cut a name that is too long even alone', () => {
      const name = `${'very-long-name-'.repeat(6)}price.ts`;

      const text = publicationTextOf(workOf({}, `src/${name}`));

      expect(text.title).toHaveLength(HEADER_MAX_LENGTH);
      expect(text.title).toMatch(/^test: cover very-long-name-.*…$/u);
    });
  });

  describe('the body', () => {
    it('should show what the gate measured on the accepted attempt', () => {
      const work = workOf({
        checks: [
          checkThat('test_files_only', 'passed'),
          checkThat('type_check', 'not_applicable'),
          checkThat('new_tests_pass', 'passed'),
          checkThat('existing_tests_pass', 'passed'),
          { ...checkThat('repeated_runs', 'passed'), runs: 3 },
          checkThat('coverage_increase', 'passed'),
          checkThat('mutation_gain', 'skipped'),
        ],
        coverageBefore: coverageOf([3, 1, 2, 3], [4, 2, 3, 4]),
        coverageAfter: coverageOf([4, 2, 3, 4], [4, 2, 3, 4]),
        mutants: null,
      });

      const { body } = publicationTextOf(work);

      expect(body).toBe(
        [
          'This pull request adds tests for `src/price.ts`, to cover more ' +
            'of its code and to catch a change to what it does.',
          [
            '| Coverage of the file | Before | After |',
            '| --- | ---: | ---: |',
            '| Statements | 75.0% (3 of 4) | 100.0% (4 of 4) |',
            '| Branches | 50.0% (1 of 2) | 100.0% (2 of 2) |',
            '| Functions | 66.6% (2 of 3) | 100.0% (3 of 3) |',
            '| Lines | 75.0% (3 of 4) | 100.0% (4 of 4) |',
          ].join('\n'),
          [
            'Checks that passed:',
            '',
            '- New test files only',
            '- New tests pass',
            '- Existing tests still pass',
            '- Repeated runs (3 runs)',
            '- Coverage increase',
          ].join('\n'),
          [
            'Checks the quality policy turned off:',
            '',
            '- Mutants killed that no test detected',
          ].join('\n'),
          ['Checks that had nothing to examine:', '', '- Type check'].join(
            '\n',
          ),
          `Base commit: \`${BASE_COMMIT}\``,
          'Written and checked by coverage-autopilot.',
        ].join('\n\n'),
      );
    });

    it('should count the mutants the new tests kill, when the gate measured them', () => {
      const work = workOf({
        mutants: { undetectedBefore: 4, killed: 3, reached: 3, timedOut: 0 },
      });

      const { body } = publicationTextOf(work);

      expect(body).toContain(
        'Mutants no test detected before: 4. The new tests kill 3 of them.',
      );
    });

    it('should show a counter with nothing to count without a share', () => {
      const work = workOf({
        coverageBefore: coverageOf([0, 0, 0, 0], [0, 0, 0, 0]),
        coverageAfter: coverageOf([1, 0, 0, 1], [1, 0, 0, 1]),
      });

      const { body } = publicationTextOf(work);

      expect(body).toContain('| Branches | 0 of 0 | 0 of 0 |');
      expect(body).toContain('| Lines | 0 of 0 | 100.0% (1 of 1) |');
    });

    describe('when the gate did not measure the coverage on both sides', () => {
      it('should leave the table out', () => {
        const work = workOf({ coverageAfter: null, mutants: null });

        const { body } = publicationTextOf(work);

        expect(body).not.toContain('| Coverage of the file |');
        expect(body).not.toContain('Mutants no test detected');
        expect(body).toContain('Base commit:');
      });
    });
  });
});

describe('shortened', () => {
  it('should keep a text that fits and mark where a longer one was cut', () => {
    expect(shortened('abc', 3)).toBe('abc');
    expect(shortened('abcd', 3)).toBe('ab…');
  });
});
