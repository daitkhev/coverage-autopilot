import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import {
  measuredTarget,
  runCoverageOf,
  snapshotDto,
  testRunOf,
  UNSUPPORTED_RUN,
  VITEST_PARAMETERS,
} from '#tests/support/verification-coverage';
import { TARGET_FILE } from '#tests/support/verification-requests';
import { CoverageIncreaseCheck } from '#verification/application/commands/verify-patch/checks/coverage-increase-check';

const RUNNING = new AbortController().signal;

function benchOf() {
  const application = verificationApplication();
  const check = new CoverageIncreaseCheck(application.coverage);
  return { application, check, ...patchedCopyOf(application) };
}

describe('CoverageIncreaseCheck', () => {
  it('should always have something to examine', () => {
    expect(benchOf().check.inapplicability()).toBeNull();
  });

  describe('run', () => {
    it('should pass when more of the target is covered, and keep both measures', async () => {
      const { check, copy } = benchOf();

      const result = await check.run(copy, RUNNING);

      expect(result.status).toBe('passed');
      expect(copy.evidence.coverage?.before).toEqual({
        statements: { covered: 4, total: 10 },
        branches: { covered: 1, total: 2 },
        functions: { covered: 1, total: 2 },
        lines: { covered: 4, total: 10 },
      });
      expect(copy.evidence.coverage?.after.lines).toEqual({
        covered: 6,
        total: 10,
      });
    });

    describe('when the target is covered as before or less', () => {
      it('should fail with what the numbers are', async () => {
        const same = benchOf();
        same.application.coverage.measured = runCoverageOf(
          measuredTarget({ covered: 4, total: 10 }),
        );
        const less = benchOf();
        less.application.coverage.measured = runCoverageOf(
          measuredTarget({ covered: 3, total: 10 }),
        );

        const unchanged = await same.check.run(same.copy, RUNNING);
        const decreased = await less.check.run(less.copy, RUNNING);

        expect(unchanged.message).toBe(
          `The new tests cover no more lines of ${TARGET_FILE}: 4 of 10, as before.`,
        );
        expect(decreased.message).toBe(
          `Fewer statements of ${TARGET_FILE} are covered with the patch: 3, against 4 before.`,
        );
      });
    });

    describe('when the two measures do not compare', () => {
      it('should be an error that running again does not help', async () => {
        const otherTools = {
          ...VITEST_PARAMETERS,
          coverageProvider: 'istanbul',
        };
        const changes: ((bench: ReturnType<typeof benchOf>) => void)[] = [
          ({ application }) => {
            application.coverage.snapshot = null;
          },
          ({ application }) => {
            application.coverage.baselineFile = {
              path: FilePath.create(TARGET_FILE),
              state: 'no_executable_code',
            };
          },
          ({ application }) => {
            application.coverage.snapshot = snapshotDto(otherTools);
          },
          ({ application }) => {
            application.coverage.measured = {
              parameters: VITEST_PARAMETERS,
              files: [],
            };
          },
          ({ application }) => {
            application.coverage.answers.push(testRunOf('passed'));
          },
        ];
        for (const change of changes) {
          const bench = benchOf();
          change(bench);

          const result = await bench.check.run(bench.copy, RUNNING);

          expect([result.status, result.retryable]).toEqual(['error', false]);
          expect(bench.copy.evidence.coverage).toBeNull();
        }
      });
    });

    describe('when the run of every test could not finish', () => {
      it('should be an error, worth running again only after a time limit', async () => {
        const late = benchOf();
        late.application.coverage.answers.push(testRunOf('timed_out'));
        const unsupported = benchOf();
        unsupported.application.coverage.answers.push(UNSUPPORTED_RUN);

        const timedOut = await late.check.run(late.copy, RUNNING);
        const refused = await unsupported.check.run(unsupported.copy, RUNNING);

        expect(timedOut.message).toBe(
          'The tests ran out of time, so no coverage was measured.',
        );
        expect(timedOut.retryable).toBe(true);
        expect(refused.retryable).toBe(false);
      });
    });
  });
});
