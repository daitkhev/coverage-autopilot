import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import { Instant } from '#kernel/time/instant';
import { loanOf } from '#tests/support/stand-in-repositories';
import {
  seenAtInstall,
  type VerificationApplication,
  verificationApplication,
} from '#tests/support/verification-application';
import { mutationBaselineDto } from '#tests/support/verification-mutants';
import {
  ALL_CHECKS,
  DEADLINE,
  NEW_TEST_FILE,
  policyOf,
  policyWithout,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import type { GateEvidence } from '#verification/application/commands/verify-patch/patched-copy';
import type { QualityPolicyDto } from '#verification/application/contracts/verification-public-api';
import { Deadline } from '#verification/application/deadline';
import { mutationBaselineOf } from '#verification/application/dto/verification-dto-mapping';
import { Stopwatch } from '#verification/application/stopwatch';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

const RUNNING = new AbortController().signal;

async function verify(
  application: VerificationApplication,
  policy: QualityPolicyDto = policyWithout('mutation_gain'),
): Promise<CheckBook> {
  const { verification, clock } = application;
  const book = new CheckBook(() => undefined);
  const evidence: GateEvidence = { coverage: null, mutation: null };
  await verification.verify(
    {
      command: verifyRequestOf({ policy }),
      policy: QualityPolicy.create(policy),
      mutationBaseline: mutationBaselineOf(mutationBaselineDto()),
      files: [FilePath.create(NEW_TEST_FILE)],
      deadline: new Deadline(clock, Instant.parse(DEADLINE)),
      book,
      evidence,
      stopwatch: Stopwatch.started(clock),
    },
    RUNNING,
  );
  return book;
}

function statusesOf(book: CheckBook): string[] {
  return book.checks.map(({ status }) => status);
}

describe('PatchVerification', () => {
  describe('verify', () => {
    it('should apply the patch to a clean clone of its commit and check it', async () => {
      const application = verificationApplication();
      const { repositories, coverage } = application;

      const book = await verify(application);

      expect(repositories.created).toEqual([
        {
          repositoryId: verifyRequestOf().repositoryId,
          commit: verifyRequestOf().baseCommit,
          purpose: 'verification:patch:improvement:7:attempt:1',
        },
      ]);
      expect(repositories.patches).toHaveLength(1);
      expect(coverage.prepared).toHaveLength(1);
      expect(statusesOf(book)).toEqual([
        'passed',
        'passed',
        'passed',
        'passed',
        'passed',
        'passed',
        'skipped',
      ]);
      expect(repositories.disposed).toEqual(['copy-1']);
      expect(application.mutationRunner.installs).toEqual([]);
    });

    it('should measure coverage in the run of every test only when required', async () => {
      const application = verificationApplication();

      await verify(
        application,
        policyWithout('mutation_gain', 'coverage_increase'),
      );

      expect(
        application.coverage.runs.map(({ withCoverage }) => withCoverage),
      ).toEqual([false, false, false, false, false]);
    });

    describe('when the policy requires the mutation check', () => {
      it('should install the tool before any check runs code of the repository', async () => {
        const application = verificationApplication();
        const seen = seenAtInstall(application);

        const book = await verify(application, policyOf());

        expect(seen).toEqual([{ prepared: 1, typeChecks: 0, testRuns: 0 }]);
        expect(application.mutationRunner.installs).toEqual([
          { ...loanOf('improvement:7:attempt:1'), testRunner: 'vitest' },
        ]);
        expect(application.typeChecker.requests).toHaveLength(1);
        expect(statusesOf(book)).toEqual(ALL_CHECKS.map(() => 'passed'));
      });

      it('should make only the mutation check an error when the tool does not install', async () => {
        const application = verificationApplication();
        application.mutationRunner.installation = {
          outcome: 'unsupported',
          detail: 'Stryker does not support Vitest 2.',
          outputReference: null,
        };

        const book = await verify(application, policyOf());

        expect(statusesOf(book)).toEqual([
          ...ALL_CHECKS.slice(0, -1).map(() => 'passed'),
          'error',
        ]);
        expect(book.checks.at(-1)?.retryable).toBe(false);
        expect(application.mutationRunner.requests).toEqual([]);
      });
    });

    describe('when git does not apply the patch', () => {
      it('should fail the first check and examine nothing else', async () => {
        const application = verificationApplication();
        application.repositories.application = {
          outcome: 'refused',
          reason: 'corrupt patch',
        };

        const book = await verify(application);

        expect(statusesOf(book)).toEqual([
          'failed',
          'not_applicable',
          'not_applicable',
          'not_applicable',
          'not_applicable',
          'not_applicable',
          'skipped',
        ]);
        expect(application.coverage.prepared).toEqual([]);
        expect(application.repositories.disposed).toEqual(['copy-1']);
      });
    });

    describe('when the packages do not install', () => {
      it('should be an error worth running again', async () => {
        const application = verificationApplication();
        application.coverage.preparation = {
          outcome: 'install_failed',
          exitCode: 1,
          outputReference: 'install',
        };

        const book = await verify(application);

        expect(book.checks[1]).toMatchObject({
          status: 'error',
          retryable: true,
          outputReference: 'install',
        });
      });
    });

    describe('when the project is no longer supported', () => {
      it('should be an error that running again does not help', async () => {
        const application = verificationApplication();
        application.coverage.preparation = {
          outcome: 'unsupported',
          reason: 'no_lockfile',
          detail: 'There is no package-lock.json.',
        };

        const book = await verify(application);

        expect(book.checks[1]?.message).toBe(
          'The project cannot be verified with the patch: There is no package-lock.json.',
        );
        expect(book.checks[1]?.retryable).toBe(false);
      });
    });

    describe('when a tool fails', () => {
      it('should throw and still dispose of the copy', async () => {
        const application = verificationApplication();
        application.typeChecker.check = async () =>
          Promise.reject(new Error('The sandbox did not start.'));

        await expect(verify(application)).rejects.toThrow('did not start');
        expect(application.repositories.disposed).toEqual(['copy-1']);
      });
    });
  });

  describe('refuse', () => {
    it('should give every later check nothing to examine', () => {
      const { verification } = verificationApplication();
      const book = new CheckBook(() => undefined);

      verification.refuse(
        book,
        QualityPolicy.create(policyWithout('mutation_gain')),
      );

      expect(book.checks[0]?.message).toBe(
        'The patch did not pass the check of test files, so it was not applied.',
      );
      expect(book.checks).toHaveLength(6);
    });
  });
});
