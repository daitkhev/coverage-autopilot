import { describe, expect, it } from 'vitest';

import { attemptDtoOf } from '#improvement/application/dto/attempt-dto-mapping';
import { Attempt } from '#improvement/domain/entities/attempt.entity';
import { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import {
  checkOf,
  hashOf,
  minutesIn,
  patchOf,
  reportOf,
  reportPropsOf,
} from '#tests/support/improvement-values';

const OPENED_AT = minutesIn(4);
const JUDGED_AT = minutesIn(6);
const GENERATOR_OUTPUT = 'outputs/generator.json';

/** An attempt whose one call wrote the patch of `a`. */
function generatedAttempt(): Attempt {
  return Attempt.open(2, OPENED_AT)
    .withCall({
      tokensUsed: 1500,
      outputReference: GENERATOR_OUTPUT,
      refusedToolCalls: [],
    })
    .withPatch(patchOf());
}

const THREE_OF_FOUR = { covered: 3, total: 4, percentage: 75 };

/** Where a test says the instance keeps the file of a reference. */
function pathOf(reference: string): string {
  return `/instance/artifacts/${reference}`;
}

describe('attemptDtoOf', () => {
  it('should show an open attempt that has no patch yet', () => {
    expect(attemptDtoOf(Attempt.open(1, OPENED_AT), pathOf)).toEqual({
      number: 1,
      status: 'open',
      startedAt: OPENED_AT,
      finishedAt: null,
      generationOutcome: null,
      tokensUsed: 0,
      patchHash: null,
      report: null,
      rawOutputPaths: [],
    });
  });

  it('should show an attempt the gate judged, with every part of its report', () => {
    const attempt = generatedAttempt().withReport(
      reportOf('rejected'),
      JUDGED_AT,
    );

    expect(attemptDtoOf(attempt, pathOf)).toEqual({
      number: 2,
      status: 'closed',
      startedAt: OPENED_AT,
      finishedAt: JUDGED_AT,
      generationOutcome: 'generated',
      tokensUsed: 1500,
      patchHash: hashOf('a'),
      report: {
        patchHash: hashOf('a'),
        verdict: 'rejected',
        reasons: ['The new test does not pass.'],
        checks: [
          {
            name: 'new_tests_pass',
            status: 'failed',
            retryable: false,
            durationMs: 1200,
            runs: null,
            message: 'The new test does not pass.',
          },
        ],
        coverageBefore: {
          statements: THREE_OF_FOUR,
          branches: THREE_OF_FOUR,
          functions: THREE_OF_FOUR,
          lines: THREE_OF_FOUR,
        },
        coverageAfter: null,
        mutants: { undetectedBefore: 1, killed: 0, reached: 1 },
        survivingMutants: [
          {
            line: 3,
            mutator: 'EqualityOperator',
            replacement: 'price >= 0',
            reached: true,
          },
        ],
      },
      rawOutputPaths: [
        pathOf(GENERATOR_OUTPUT),
        pathOf('outputs/new-tests.txt'),
      ],
    });
  });

  it('should give the raw output of the generator and of the checks once each', () => {
    const shared = checkOf('repeated_runs', 'rejected');
    const report = VerificationReport.create({
      ...reportPropsOf('rejected'),
      checks: [
        checkOf('new_tests_pass', 'rejected'),
        shared,
        { ...checkOf('mutation_gain', 'rejected'), outputReference: null },
      ],
    });

    const attempt = generatedAttempt().withReport(report, JUDGED_AT);

    expect(attemptDtoOf(attempt, pathOf).rawOutputPaths).toEqual([
      pathOf(GENERATOR_OUTPUT),
      pathOf(String(shared.outputReference)),
    ]);
  });

  it('should keep a report that stopped before it measured the target', () => {
    const report = VerificationReport.create({
      ...reportPropsOf('inconclusive'),
      coverageBefore: null,
      mutants: null,
      survivingMutants: [],
    });

    const shown = attemptDtoOf(
      generatedAttempt().withReport(report, JUDGED_AT),
      pathOf,
    );

    expect(shown.status).toBe('open');
    expect(shown.report?.coverageBefore).toBeNull();
    expect(shown.report?.mutants).toBeNull();
  });

  it('should give no percentage of a counter with nothing to count', () => {
    const nothing = { covered: 0, total: 0 };
    const report = VerificationReport.create({
      ...reportPropsOf('accepted'),
      coverageAfter: {
        statements: nothing,
        branches: nothing,
        functions: { covered: 1, total: 2 },
        lines: nothing,
      },
    });

    const shown = attemptDtoOf(
      generatedAttempt().withReport(report, JUDGED_AT),
      pathOf,
    );

    expect(shown.report?.coverageAfter?.statements).toEqual({
      covered: 0,
      total: 0,
      percentage: null,
    });
    expect(shown.report?.coverageAfter?.functions.percentage).toBe(50);
  });

  it('should show an attempt the generator closed without a patch', () => {
    const attempt = Attempt.open(1, OPENED_AT).closedBy(
      'no_changes',
      JUDGED_AT,
    );

    expect(attemptDtoOf(attempt, pathOf)).toEqual(
      expect.objectContaining({
        status: 'closed',
        generationOutcome: 'no_changes',
        patchHash: null,
        report: null,
      }),
    );
  });
});
