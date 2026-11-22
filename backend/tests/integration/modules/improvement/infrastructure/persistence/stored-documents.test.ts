import { describe, expect, it } from 'vitest';

import { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import {
  verificationBaselineFrom,
  verificationBaselineText,
  verificationReportFrom,
  verificationReportText,
} from '#improvement/infrastructure/persistence/stored-documents';
import {
  BASE_COMMIT,
  baselineOf,
  failedRunReportProps,
  FAILING_TESTS,
  hashOf,
  reportOf,
  RUN_FAILURE,
  TARGET_FILE,
} from '#tests/support/improvement-values';

/** A baseline as the service stored it before it kept failing tests. */
function firstBaseline(existingTests: string): string {
  return JSON.stringify({
    version: 1,
    commit: BASE_COMMIT,
    targetFile: TARGET_FILE,
    typeCheck: 'passes',
    existingTests,
    mutation: null,
  });
}

/** A report as the service stored it before a check kept a failure. */
const FIRST_VERSION = JSON.stringify({
  version: 1,
  patchHash: hashOf('a'),
  verdict: 'rejected',
  reasons: ['The new tests fail.'],
  checks: [
    {
      name: 'new_tests_pass',
      status: 'failed',
      retryable: false,
      durationMs: 1200,
      runs: null,
      message: 'The new tests fail.',
      outputReference: 'outputs/new-tests.txt',
    },
  ],
  coverageBefore: null,
  coverageAfter: null,
  mutants: null,
  survivingMutants: [
    {
      file: 'src/price.ts',
      mutator: 'EqualityOperator',
      startLine: 3,
      startColumn: 9,
      endLine: 3,
      endColumn: 14,
      replacement: 'price >= 0',
      reached: true,
    },
  ],
});

function withFirstCheck(json: string, change: object): string {
  const document = JSON.parse(json) as { checks: object[] };
  const [check] = document.checks;
  return JSON.stringify({ ...document, checks: [{ ...check, ...change }] });
}

describe('stored documents', () => {
  describe('verificationBaselineText', () => {
    it('should write the second version, with the tests that failed', () => {
      const baseline = baselineOf({
        existingTests: 'failed',
        failingTests: FAILING_TESTS,
      });

      expect(JSON.parse(verificationBaselineText(baseline))).toMatchObject({
        version: 2,
        failingTests: [
          { file: 'tests/feed.test.ts', test: 'feed > reads the feed' },
          { file: 'tests/clock.test.ts', test: null },
        ],
      });
    });
  });

  describe('verificationBaselineFrom', () => {
    it.each([
      ['tests that failed', FAILING_TESTS],
      ['no test that failed', []],
      ['tests that are not known', null],
    ])('should give back the baseline it wrote, with %s', (_case, failing) => {
      const baseline = baselineOf({
        existingTests: failing?.length === 0 ? 'passed' : 'failed',
        failingTests: failing,
      });

      expect(
        verificationBaselineFrom(verificationBaselineText(baseline)),
      ).toEqual(baseline);
    });

    it.each([
      ['passed', []],
      ['failed', null],
      ['timed_out', null],
    ])(
      'should read a baseline of the first version whose tests %s',
      (existingTests, failingTests) => {
        const baseline = verificationBaselineFrom(firstBaseline(existingTests));

        expect(baseline.existingTests).toBe(existingTests);
        expect(baseline.failingTests).toEqual(failingTests);
      },
    );

    it.each([
      [
        'a baseline of the first version that names failing tests',
        JSON.stringify({
          ...JSON.parse(firstBaseline('failed')),
          failingTests: [],
        }),
      ],
      [
        'a baseline of the second version that does not',
        JSON.stringify({ ...JSON.parse(firstBaseline('failed')), version: 2 }),
      ],
    ])('should refuse %s', (_case, json) => {
      expect(() => verificationBaselineFrom(json)).toThrow(
        expect.objectContaining({ name: 'ZodError' }),
      );
    });
  });

  describe('verificationReportText', () => {
    it('should write the second version, with the failure of each check', () => {
      const text = verificationReportText(
        VerificationReport.create(failedRunReportProps()),
      );

      expect(JSON.parse(text)).toMatchObject({
        version: 2,
        checks: [
          {
            name: 'new_tests_pass',
            testFailure: {
              file: 'tests/helpers/utils.test.ts',
              test: null,
              lines: RUN_FAILURE.lines,
            },
          },
        ],
      });
    });
  });

  describe('verificationReportFrom', () => {
    it('should give back the report it wrote, the failure of a check included', () => {
      const report = VerificationReport.create(failedRunReportProps());

      const read = verificationReportFrom(verificationReportText(report));

      expect(read).toEqual(report);
      expect(read.checks[0]?.testFailure?.file.value).toBe(
        'tests/helpers/utils.test.ts',
      );
    });

    it('should give back a report whose checks named no failure', () => {
      const report = reportOf('rejected');

      expect(verificationReportFrom(verificationReportText(report))).toEqual(
        report,
      );
    });

    it('should read a report of the first version, with no failure in any check', () => {
      const report = verificationReportFrom(FIRST_VERSION);

      expect(report.reasons).toEqual(['The new tests fail.']);
      expect(report.checks).toEqual([
        {
          name: 'new_tests_pass',
          status: 'failed',
          retryable: false,
          durationMs: 1200,
          runs: null,
          message: 'The new tests fail.',
          outputReference: 'outputs/new-tests.txt',
          testFailure: null,
        },
      ]);
      expect(report.survivingMutants[0]?.file.value).toBe('src/price.ts');
    });

    it.each([
      [
        'a check of the first version that names a failure',
        withFirstCheck(FIRST_VERSION, { testFailure: null }),
      ],
      [
        'a check of the second version that says nothing of a failure',
        JSON.stringify({ ...JSON.parse(FIRST_VERSION), version: 2 }),
      ],
      [
        'a version no service wrote',
        JSON.stringify({ ...JSON.parse(FIRST_VERSION), version: 3 }),
      ],
    ])('should refuse %s', (_case, json) => {
      expect(() => verificationReportFrom(json)).toThrow(
        expect.objectContaining({ name: 'ZodError' }),
      );
    });
  });
});
