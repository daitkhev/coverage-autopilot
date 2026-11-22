import { describe, expect, it } from 'vitest';

import { Instant } from '#kernel/time/instant';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';
import {
  seenAtInstall,
  type VerificationApplication,
  verificationApplication,
} from '#tests/support/verification-application';
import {
  FAILING_TESTS,
  failingRunOf,
  testRunOf,
  UNSUPPORTED_RUN,
} from '#tests/support/verification-coverage';
import { mutationBaselineDto } from '#tests/support/verification-mutants';
import {
  DEADLINE,
  HOUR_MS,
  measureRequestOf,
  policyOf,
  policyWithout,
} from '#tests/support/verification-requests';
import { VERIFICATION_TEST_SETTINGS } from '#tests/support/verification-stand-ins';
import type {
  BaselineProgress,
  QualityPolicyDto,
} from '#verification/application/contracts/verification-public-api';
import { Deadline } from '#verification/application/deadline';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

const RUNNING = new AbortController().signal;

const OWNER = 'improvement:7';

async function measure(
  application: VerificationApplication,
  policy: QualityPolicyDto = policyOf(),
) {
  const heard: BaselineProgress[] = [];
  const result = await application.measurement.measure(
    {
      command: measureRequestOf({ policy }),
      policy: QualityPolicy.create(policy),
      deadline: new Deadline(application.clock, Instant.parse(DEADLINE)),
      report: (progress) => heard.push(progress),
    },
    RUNNING,
  );
  return { result, heard };
}

describe('BaselineMeasurement', () => {
  describe('measure', () => {
    it('should measure the commit in a working copy of its own', async () => {
      const application = verificationApplication();

      const { result } = await measure(application);

      expect(application.repositories.created).toEqual([
        expect.objectContaining({ purpose: `verification:baseline:${OWNER}` }),
      ]);
      expect(application.repositories.disposed).toEqual(['copy-1']);
      expect(result).toEqual({
        outcome: 'measured',
        baseline: {
          commit: measureRequestOf().commit,
          targetFile: measureRequestOf().targetFile,
          typeCheck: 'passes',
          existingTests: 'passed',
          failingTests: [],
          mutation: mutationBaselineDto(),
        },
      });
    });

    it('should lend the copy to every tool, with the limits of the settings', async () => {
      const application = verificationApplication();
      const loan = { workingCopyPath: WORKING_COPY_PATH, owner: OWNER };

      await measure(application);

      expect(application.coverage.prepared).toEqual([loan]);
      expect(application.mutationRunner.installs).toEqual([
        { ...loan, testRunner: 'vitest' },
      ]);
      expect(application.typeChecker.requests).toEqual([
        { ...loan, timeoutMs: VERIFICATION_TEST_SETTINGS.typeCheckTimeoutMs },
      ]);
      expect(application.coverage.runs).toEqual([
        { ...loan, testFiles: [], withCoverage: false },
      ]);
      expect(application.mutationRunner.requests).toEqual([
        {
          ...loan,
          targetFile: measureRequestOf().targetFile,
          testRunner: 'vitest',
          timeoutMs: VERIFICATION_TEST_SETTINGS.mutationRunTimeoutMs,
        },
      ]);
    });

    it('should install the mutation tool before any code of the repository runs', async () => {
      const application = verificationApplication();
      const seen = seenAtInstall(application);

      await measure(application);

      expect(seen).toEqual([{ prepared: 1, typeChecks: 0, testRuns: 0 }]);
    });

    it('should report each step as it starts and ends', async () => {
      const { heard } = await measure(verificationApplication());

      expect(heard.map(({ step, status }) => `${step}:${status}`)).toEqual([
        'prepare:running',
        'prepare:done',
        'type_check:running',
        'type_check:done',
        'existing_tests:running',
        'existing_tests:done',
        'mutation_baseline:running',
        'mutation_baseline:done',
      ]);
    });

    describe('when the policy does not require the mutation check', () => {
      it('should measure no mutant', async () => {
        const application = verificationApplication();

        const { result } = await measure(
          application,
          policyWithout('mutation_gain'),
        );

        expect(result).toMatchObject({ baseline: { mutation: null } });
        expect(application.mutationRunner.installs).toEqual([]);
        expect(application.mutationRunner.requests).toEqual([]);
      });
    });

    describe('when the commit does not type-check or its tests fail', () => {
      it('should keep both as they are', async () => {
        const application = verificationApplication();
        application.typeChecker.result = { outcome: 'absent' };
        application.coverage.answers.push(testRunOf('timed_out'));

        const { result } = await measure(application);

        expect(result).toMatchObject({
          baseline: { typeCheck: 'absent', existingTests: 'timed_out' },
        });
      });

      it('should keep the tests that failed, when the settings let them', async () => {
        const application = verificationApplication();
        application.coverage.answers.push(failingRunOf());

        const { result } = await measure(application);

        expect(result).toMatchObject({
          baseline: { existingTests: 'failed', failingTests: FAILING_TESTS },
        });
      });
    });

    describe('when less time is left than a tool may take', () => {
      it('should give the tool what is left', async () => {
        const application = verificationApplication();
        application.coverage.onRun = () => {
          application.clock.advance(HOUR_MS - 1000);
        };

        await measure(application);

        expect(application.mutationRunner.requests[0]?.timeoutMs).toBe(1000);
      });
    });
  });

  describe('measure, when the commit cannot be verified', () => {
    it('should answer a runner that cannot run the tests', async () => {
      const application = verificationApplication();
      application.coverage.answers.push(UNSUPPORTED_RUN);

      const { result } = await measure(application);

      expect(result).toMatchObject({
        outcome: 'unsupported',
        reason: 'project_unsupported',
        detail: 'No test runner is installed.',
      });
    });

    it('should answer tests that fail and must pass, and measure no mutant', async () => {
      const application = verificationApplication({
        ...VERIFICATION_TEST_SETTINGS,
        baselineTests: 'must_pass',
      });
      application.coverage.answers.push(failingRunOf());

      const { result } = await measure(application);

      expect(result).toMatchObject({
        outcome: 'unsupported',
        reason: 'existing_tests_fail',
        detail: /^2 of 4 tests of the repository fail in the sandbox\./u,
        outputReference: 'test-run-failed',
      });
      expect(application.mutationRunner.requests).toEqual([]);
    });

    it('should answer a mutation tool that cannot be installed, and run nothing', async () => {
      const application = verificationApplication();
      application.mutationRunner.installation = {
        outcome: 'unsupported',
        detail: 'Stryker does not support Vitest 2.',
        outputReference: 'mutation-install',
      };

      const { result } = await measure(application);

      expect(result).toEqual({
        outcome: 'unsupported',
        reason: 'mutation_unsupported',
        detail: 'Stryker does not support Vitest 2.',
        outputReference: 'mutation-install',
      });
      expect(application.typeChecker.requests).toEqual([]);
      expect(application.coverage.runs).toEqual([]);
    });

    it('should answer a mutation tool that cannot run', async () => {
      const application = verificationApplication();
      application.mutationRunner.baseline = {
        outcome: 'unsupported',
        detail: 'The tests fail before any mutant.',
        outputReference: 'mutation-output',
      };

      const { result } = await measure(application);

      expect(result).toEqual({
        outcome: 'unsupported',
        reason: 'mutation_unsupported',
        detail: 'The tests fail before any mutant.',
        outputReference: 'mutation-output',
      });
    });
  });

  describe('measure, when time runs out', () => {
    it('should answer timed_out for a tool stopped at its limit', async () => {
      const application = verificationApplication();
      application.typeChecker.result = {
        outcome: 'timed_out',
        durationMs: 300_000,
        outputReference: 'type-check',
      };
      const typeCheck = await measure(application);
      application.typeChecker.result = { outcome: 'absent' };
      application.mutationRunner.baseline = {
        outcome: 'timed_out',
        cacheReference: null,
        outputReference: null,
      };
      const mutation = await measure(application);

      expect(typeCheck.result).toEqual({ outcome: 'timed_out' });
      expect(mutation.result).toEqual({ outcome: 'timed_out' });
    });

    it('should start no step after the deadline', async () => {
      const application = verificationApplication();
      application.coverage.onRun = () => {
        application.clock.advance(HOUR_MS);
      };
      const late = verificationApplication();
      late.typeChecker.onCheck = () => {
        late.clock.advance(HOUR_MS);
      };

      const { result, heard } = await measure(application);
      const afterTypeCheck = await measure(late);

      expect(result).toEqual({ outcome: 'timed_out' });
      expect(heard.at(-1)).toEqual({ step: 'existing_tests', status: 'done' });
      expect(application.mutationRunner.requests).toEqual([]);
      expect(afterTypeCheck.result).toEqual({ outcome: 'timed_out' });
      expect(late.coverage.runs).toEqual([]);
    });

    it('should not install after a clone that ended past the deadline', async () => {
      const application = verificationApplication();
      const { repositories, clock } = application;
      const clone = repositories.createWorkingCopy.bind(repositories);
      repositories.createWorkingCopy = async (request, signal) => {
        clock.advance(HOUR_MS);
        return clone(request, signal);
      };

      const { result } = await measure(application);

      expect(result).toEqual({ outcome: 'timed_out' });
      expect(application.coverage.prepared).toEqual([]);
      expect(application.repositories.disposed).toEqual(['copy-1']);
    });

    it('should not install the tool after packages that installed past the deadline', async () => {
      const application = verificationApplication();
      application.coverage.onPrepare = () => {
        application.clock.advance(HOUR_MS);
      };

      const { result } = await measure(application);

      expect(result).toEqual({ outcome: 'timed_out' });
      expect(application.mutationRunner.installs).toEqual([]);
    });

    it('should clone nothing when the deadline has passed', async () => {
      const application = verificationApplication();
      application.clock.advance(HOUR_MS);

      const { result } = await measure(application);

      expect(result).toEqual({ outcome: 'timed_out' });
      expect(application.repositories.created).toEqual([]);
    });
  });

  describe('measure, when a tool fails', () => {
    it('should throw and still dispose of the copy', async () => {
      const application = verificationApplication();
      application.typeChecker.check = async () =>
        Promise.reject(new Error('The sandbox did not start.'));

      await expect(measure(application)).rejects.toThrow('did not start');
      expect(application.repositories.disposed).toEqual(['copy-1']);
    });
  });
});
