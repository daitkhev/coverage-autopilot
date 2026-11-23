import { describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { verificationApplication } from '#tests/support/verification-application';
import { testRunOf } from '#tests/support/verification-coverage';
import { mutationBaselineDto } from '#tests/support/verification-mutants';
import {
  ALL_CHECKS,
  baselineOf,
  newFilePatch,
  policyOf,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import type {
  CheckProgress,
  VerificationReportDto,
  VerifyPatchRequest,
} from '#verification/application/contracts/verification-public-api';
import { BaselineMismatchError } from '#verification/application/errors/baseline-mismatch.error';

const RUNNING = new AbortController().signal;

/** Every check required, with the mutants of the baseline measured. */
function fullRequest(
  overrides: Partial<VerifyPatchRequest> = {},
): VerifyPatchRequest {
  return verifyRequestOf({
    policy: policyOf(),
    baseline: baselineOf({ mutation: mutationBaselineDto() }),
    ...overrides,
  });
}

function statusesOf(report: VerificationReportDto): string[] {
  return report.checks.map(({ status }) => status);
}

describe('VerifyPatchHandler', () => {
  describe('execute', () => {
    it('should accept a patch that passes all seven checks', async () => {
      const { patchHandler } = verificationApplication();
      const heard: CheckProgress[] = [];

      const report = await patchHandler.execute(
        fullRequest({ onProgress: (progress) => heard.push(progress) }),
        RUNNING,
      );

      expect(report.patchHash).toBe('patch-hash');
      expect(report.verdict).toBe('accepted');
      expect(report.reasons).toEqual([]);
      expect(report.checks.map(({ name }) => name)).toEqual(ALL_CHECKS);
      expect(report.coverageAfter?.lines).toEqual({ covered: 6, total: 10 });
      expect(report.mutants).toEqual({
        undetectedBefore: 3,
        killed: 3,
        reached: 3,
        timedOut: 0,
      });
      expect(heard[0]).toEqual({ check: 'test_files_only', status: 'running' });
      expect(heard.at(-1)).toEqual({
        check: 'mutation_gain',
        status: 'passed',
      });
    });

    it('should reject a patch whose new tests fail, with every reason', async () => {
      const { patchHandler, coverage } = verificationApplication();
      coverage.answers.push(
        testRunOf('failed'),
        testRunOf('failed', coverage.measured),
      );

      const report = await patchHandler.execute(fullRequest(), RUNNING);

      expect(report.verdict).toBe('rejected');
      expect(report.reasons).toEqual([
        'The new tests fail.',
        'Tests of the project fail with the new tests.',
      ]);
      expect(statusesOf(report)).toEqual([
        'passed',
        'passed',
        'failed',
        'failed',
        'not_applicable',
        'passed',
        'not_applicable',
      ]);
    });

    describe('when the text of the patch changes more than test files', () => {
      it('should reject it without cloning anything', async () => {
        const { patchHandler, repositories } = verificationApplication();

        const report = await patchHandler.execute(
          fullRequest({
            patch: { text: newFilePatch('src/used.ts'), hash: 'h' },
          }),
          RUNNING,
        );

        expect(report.verdict).toBe('rejected');
        expect(statusesOf(report)).toEqual([
          'failed',
          ...Array<string>(6).fill('not_applicable'),
        ]);
        expect(report.checks[0]?.durationMs).toBe(0);
        expect(repositories.created).toEqual([]);
      });
    });

    describe('when a required check cannot finish', () => {
      it('should be inconclusive', async () => {
        const { patchHandler, typeChecker } = verificationApplication();
        typeChecker.result = {
          outcome: 'timed_out',
          durationMs: 300_000,
          outputReference: 'type-check',
        };

        const report = await patchHandler.execute(verifyRequestOf(), RUNNING);

        expect(report.verdict).toBe('inconclusive');
        expect(report.reasons).toEqual(['The type check ran out of time.']);
      });
    });

    describe('when the baseline is of another commit or file', () => {
      it('should throw BaselineMismatchError', async () => {
        const { patchHandler } = verificationApplication();
        const otherCommit = CommitSha.create('d'.repeat(40));

        await expect(
          patchHandler.execute(
            verifyRequestOf({ baseline: baselineOf({ commit: otherCommit }) }),
            RUNNING,
          ),
        ).rejects.toThrow(BaselineMismatchError);
      });
    });
  });
});
