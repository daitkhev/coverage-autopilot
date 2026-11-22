import { describe, expect, it } from 'vitest';

import type { FileCoverageDto } from '#coverage/application/contracts/coverage-public-api';
import {
  generationRequestOf,
  type RequestParts,
} from '#improvement/application/commands/run-improvement/generation-request';
import { Improvement } from '#improvement/domain/entities/improvement.entity';
import { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import { FilePath } from '#kernel/primitives/file-path';
import { measuredPrice } from '#tests/support/improvement-generation-inputs';
import { improvementIn } from '#tests/support/improvement-journeys';
import {
  baselineOf,
  checkOf,
  failedRunReportProps,
  IMPROVEMENT_ID,
  minutesIn,
  reportOf,
  RUN_FAILURE,
  TARGET_FILE,
  TEST_SETTINGS,
} from '#tests/support/improvement-values';

const OWNER = `improvement:${IMPROVEMENT_ID}:attempt:1`;
const COPY_PATH = '/work/acme-shop';

/** The one mutant of the baseline, as a place to aim a test at. */
const MUTANT_HINT = {
  line: 3,
  mutator: 'EqualityOperator',
  replacement: 'price >= 0',
};

function partsOf(
  improvement: Improvement,
  change: Partial<RequestParts> = {},
): RequestParts {
  return {
    improvement,
    subject: { testRunner: 'jest', file: measuredPrice() },
    owner: OWNER,
    workingCopyPath: COPY_PATH,
    settings: TEST_SETTINGS,
    now: minutesIn(10),
    ...change,
  };
}

function targetFor(file: FileCoverageDto | null) {
  const improvement = improvementIn('generating');
  const subject = { testRunner: 'vitest', file } as const;
  return generationRequestOf(partsOf(improvement, { subject })).target;
}

describe('generationRequestOf', () => {
  it('should lend the copy for the attempt, with the runner, the endings and the generator', () => {
    const request = generationRequestOf(partsOf(improvementIn('generating')));

    expect(request).toMatchObject({
      workingCopyPath: COPY_PATH,
      owner: OWNER,
      testRunner: 'jest',
      testFileSuffixes: TEST_SETTINGS.testFileSuffixes,
      generator: {
        cli: 'claude_code',
        model: 'claude-sonnet',
        promptVersion: 'v1',
      },
    });
    expect(request.generator).not.toHaveProperty('billing');
  });

  describe('target', () => {
    it('should aim at what no test reaches in the fresh snapshot and at the mutants no test detects', () => {
      expect(targetFor(measuredPrice())).toEqual({
        file: FilePath.create(TARGET_FILE),
        uncoveredLines: [{ start: 3, end: 5 }],
        openBranchLines: [12],
        uncoveredFunctions: [{ name: 'discount', line: 3 }],
        undetectedMutants: [MUTANT_HINT],
      });
    });

    describe('when the fresh snapshot does not measure the target', () => {
      it.each([
        ['does not list it', null],
        [
          'could not measure it',
          {
            path: FilePath.create(TARGET_FILE),
            state: 'unmeasured',
            reason: 'missing_from_report',
            toolMessage: null,
          },
        ],
        [
          'found no code in it',
          { path: FilePath.create(TARGET_FILE), state: 'no_executable_code' },
        ],
      ] as const)('should aim at the mutants alone when it %s', (_, file) => {
        expect(targetFor(file)).toEqual({
          file: FilePath.create(TARGET_FILE),
          uncoveredLines: [],
          openBranchLines: [],
          uncoveredFunctions: [],
          undetectedMutants: [MUTANT_HINT],
        });
      });
    });

    describe('when the gate measured no mutants', () => {
      it('should name no mutant', () => {
        const improvement = Improvement.restore({
          ...improvementIn('generating').state,
          verificationBaseline: baselineOf({ mutation: null }),
        });

        const { target } = generationRequestOf(partsOf(improvement));

        expect(target.undetectedMutants).toEqual([]);
      });
    });
  });

  describe('feedback', () => {
    it('should be empty for the first attempt', () => {
      const request = generationRequestOf(partsOf(improvementIn('generating')));

      expect(request.feedback).toBeNull();
    });

    it('should give the reasons and the surviving mutants of the last rejection', () => {
      const improvement = improvementIn('verifying');
      improvement.recordVerdict(reportOf('rejected'), minutesIn(6));

      const request = generationRequestOf(partsOf(improvement));

      expect(request.feedback).toEqual({
        reasons: ['The new test does not pass.'],
        survivingMutants: [{ ...MUTANT_HINT, reached: true }],
        testFailure: null,
      });
    });

    it('should give what the first run of tests that failed said first', () => {
      const improvement = improvementIn('verifying');
      const later = { ...RUN_FAILURE, test: 'utils makes an id', lines: ['?'] };
      improvement.recordVerdict(
        VerificationReport.create({
          ...failedRunReportProps(),
          checks: [
            checkOf('type_check', 'rejected'),
            {
              ...checkOf('new_tests_pass', 'rejected'),
              testFailure: RUN_FAILURE,
            },
            {
              ...checkOf('existing_tests_pass', 'rejected'),
              testFailure: later,
            },
          ],
        }),
        minutesIn(6),
      );

      const request = generationRequestOf(partsOf(improvement));

      expect(request.feedback?.testFailure).toEqual(RUN_FAILURE);
    });
  });

  describe('limits', () => {
    it('should give the turns, the cost and the time of the settings', () => {
      const request = generationRequestOf(partsOf(improvementIn('generating')));

      expect(request.limits).toEqual({
        maxTurns: 12,
        maxCostUsd: null,
        timeoutMs: 600_000,
      });
    });

    describe('when less time is left to the deadline than the settings give', () => {
      it('should give the call what is left', () => {
        const improvement = improvementIn('generating');

        const request = generationRequestOf(
          partsOf(improvement, { now: minutesIn(25) }),
        );

        expect(improvement.deadlineAt).toEqual(minutesIn(31));
        expect(request.limits.timeoutMs).toBe(360_000);
      });

      it('should never give less than a millisecond', () => {
        const request = generationRequestOf(
          partsOf(improvementIn('generating'), { now: minutesIn(40) }),
        );

        expect(request.limits.timeoutMs).toBe(1);
      });
    });
  });
});
