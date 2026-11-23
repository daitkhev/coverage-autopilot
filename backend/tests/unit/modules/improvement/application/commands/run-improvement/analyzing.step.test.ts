import { beforeEach, describe, expect, it } from 'vitest';

import { AnalyzingStep } from '#improvement/application/commands/run-improvement/analyzing.step';
import type { StepResult } from '#improvement/application/commands/run-improvement/improvement-step';
import { Improvement } from '#improvement/domain/entities/improvement.entity';
import { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import { ToolFault } from '#tests/support/improvement-handler-fault';
import {
  type AnalysisModules,
  analysisModules,
  gateBaselineOf,
} from '#tests/support/improvement-handler-modules';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRunBench } from '#tests/support/improvement-run-bench';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  baselineOf,
  IMPROVEMENT_ID,
} from '#tests/support/improvement-values';

let bench: ImprovementRunBench;
let modules: AnalysisModules;

beforeEach(() => {
  bench = new ImprovementRunBench();
  modules = analysisModules();
});

function stepOf(): AnalyzingStep {
  return new AnalyzingStep(
    modules.repositories,
    modules.coverage,
    modules.verification,
  );
}

async function analyze(
  improvement: Improvement = improvementIn('analyzing'),
): Promise<StepResult> {
  return stepOf().run(await bench.runOf(improvement));
}

/** The status and the reason it ended with, once the step has run. */
async function endingAfterAnalysis(): Promise<unknown> {
  await analyze();
  const { status, failure, skip } = await bench.stored();
  return { status, reason: (failure ?? skip)?.reason };
}

function lastStatuses(): string[] | undefined {
  return bench.context.reported.at(-1)?.steps.map(({ status }) => status);
}

/** An improvement whose gate does not check the mutants. */
function withoutMutationCheck(): Improvement {
  const { state } = improvementIn('analyzing');
  const { request } = state;
  return Improvement.restore({
    ...state,
    request: ImprovementRequest.create({
      repositoryId: request.repositoryId,
      sourceSnapshotId: request.sourceSnapshotId,
      baseCommit: request.baseCommit,
      targetFile: request.targetFile,
      mode: request.mode,
      key: request.key,
      fingerprint: request.fingerprint,
      policy: QualityPolicy.create({
        requiredChecks: ['test_files_only', 'new_tests_pass'],
        repeatedRuns: 1,
        mutationThreshold: 0,
      }),
      generator: request.generator,
      budget: request.budget,
    }),
  });
}

describe('AnalyzingStep', () => {
  it('should do the work of analyzing and fail on a fault as a verification error', () => {
    const step = stepOf();

    expect(step.status).toBe('analyzing');
    expect(step.faultReason).toBe('verification_error');
  });

  describe('run', () => {
    it('should record both baselines and start generating', async () => {
      const result = await analyze();

      const stored = await bench.stored();
      expect(result).toEqual({ next: 'continue' });
      expect(stored.status).toBe('generating');
      expect(stored.baselineSnapshotId?.value).toBe(BASELINE_SNAPSHOT_ID);
      expect(stored.verificationBaseline).toEqual(baselineOf());
    });

    it('should ask about the commit and the file of the request', async () => {
      await analyze();

      const { request } = improvementIn('analyzing');
      expect(modules.repositories.assessed).toEqual([
        {
          repositoryId: request.repositoryId,
          snapshotCommit: request.baseCommit,
          targetFile: request.targetFile,
        },
      ]);
      expect(modules.coverage.captured).toEqual([
        {
          repositoryId: request.repositoryId,
          commit: request.baseCommit,
          originKey: `improvement:${IMPROVEMENT_ID}:baseline`,
        },
      ]);
      expect(modules.coverage.read).toEqual([
        { snapshotId: BASELINE_SNAPSHOT_ID, path: request.targetFile },
      ]);
    });

    it('should give the gate the policy, the deadline and the owner', async () => {
      await analyze();

      const { request, deadlineAt } = improvementIn('analyzing');
      const [asked] = modules.verification.requests;
      expect(asked).toMatchObject({
        repositoryId: request.repositoryId,
        commit: request.baseCommit,
        targetFile: request.targetFile,
        policy: {
          requiredChecks: [
            'test_files_only',
            'new_tests_pass',
            'mutation_gain',
          ],
          repeatedRuns: 3,
          mutationThreshold: 60,
        },
        deadline: deadlineAt,
        owner: `improvement:${IMPROVEMENT_ID}`,
      });
      expect(asked?.onProgress).toBeTypeOf('function');
    });

    it('should report the full list of its steps with one status changed each time', async () => {
      await analyze();

      const reports = bench.context.reported.map(({ steps }) =>
        steps.map(({ status }) => status).join(' '),
      );
      expect(bench.context.reported[0]?.steps.map(({ code }) => code)).toEqual([
        'revision_check',
        'fresh_snapshot',
        'prepare',
        'type_check',
        'existing_tests',
        'mutation_baseline',
      ]);
      expect(reports.slice(0, 2)).toEqual([
        'pending pending pending pending pending pending',
        'running pending pending pending pending pending',
      ]);
      expect(reports.at(-1)).toBe('passed passed passed passed passed passed');
      expect(reports).toHaveLength(13);
    });

    describe('when the target file changed on the default branch', () => {
      it('should fail with stale_snapshot and measure nothing', async () => {
        modules.repositories.assessment = {
          outcome: 'stale',
          headCommit: CommitSha.create('d'.repeat(BASE_COMMIT.length)),
        };

        expect(await endingAfterAnalysis()).toEqual({
          status: 'failed',
          reason: 'stale_snapshot',
        });
        expect(modules.coverage.captured).toEqual([]);
        expect(lastStatuses()?.slice(0, 2)).toEqual(['failed', 'pending']);
      });
    });

    describe('when the fresh snapshot cannot be taken', () => {
      it('should fail with verification_error and ask the gate nothing', async () => {
        modules.coverage.capture = {
          outcome: 'install_failed',
          outputReference: 'artifact-1',
        };

        expect(await endingAfterAnalysis()).toEqual({
          status: 'failed',
          reason: 'verification_error',
        });
        expect(modules.verification.requests).toEqual([]);
        expect(lastStatuses()?.slice(0, 2)).toEqual(['passed', 'failed']);
      });
    });

    describe('when the fresh snapshot does not list the target', () => {
      it('should fail after the snapshot is recorded', async () => {
        modules.coverage.file = null;

        expect(await endingAfterAnalysis()).toEqual({
          status: 'failed',
          reason: 'verification_error',
        });
        expect((await bench.stored()).baselineSnapshotId?.value).toBe(
          BASELINE_SNAPSHOT_ID,
        );
      });
    });

    describe('when the target already meets the threshold', () => {
      it('should skip and ask the gate nothing', async () => {
        const { file } = modules.coverage;
        if (file?.state === 'measured') {
          modules.coverage.file = { ...file, belowThreshold: false };
        }

        expect(await endingAfterAnalysis()).toEqual({
          status: 'skipped',
          reason: 'threshold_met',
        });
        expect(modules.verification.requests).toEqual([]);
      });
    });

    describe('when the gate cannot measure the commit', () => {
      it('should fail and mark the step of the gate it heard of last', async () => {
        modules.verification.result = {
          outcome: 'unsupported',
          reason: 'mutation_unsupported',
          detail: 'Stryker does not support this runner.',
          outputReference: null,
        };

        expect(await endingAfterAnalysis()).toEqual({
          status: 'failed',
          reason: 'mutation_unsupported',
        });
        expect(lastStatuses()?.slice(-2)).toEqual(['passed', 'failed']);
      });
    });

    describe('when the policy does not check the mutants', () => {
      it('should keep a baseline with no mutants and start generating', async () => {
        modules.verification.result = {
          outcome: 'measured',
          baseline: { ...gateBaselineOf(), mutation: null },
        };

        await analyze(withoutMutationCheck());

        const stored = await bench.stored();
        expect(stored.status).toBe('generating');
        expect(stored.verificationBaseline?.mutation).toBeNull();
        expect(modules.verification.requests[0]?.policy.requiredChecks).toEqual(
          ['test_files_only', 'new_tests_pass'],
        );
      });
    });

    describe('when it runs again after a fault of the gate', () => {
      it('should ask for the same snapshot and go on from it', async () => {
        modules.verification.faults.push(
          new ToolFault({ message: 'The sandbox stopped.', retryable: true }),
        );
        const run = await bench.runOf(improvementIn('analyzing'));
        await expect(stepOf().run(run)).rejects.toBeInstanceOf(ToolFault);
        expect((await bench.stored()).baselineSnapshotId?.value).toBe(
          BASELINE_SNAPSHOT_ID,
        );

        await stepOf().run(run);

        const keys = modules.coverage.captured.map(
          ({ originKey }) => originKey,
        );
        expect(keys).toEqual([keys[0], keys[0]]);
        expect((await bench.stored()).status).toBe('generating');
      });
    });

    describe('when the job is stopped', () => {
      it('should let the stop pass and save nothing', async () => {
        bench.context.stop('user_cancelled');

        await expect(analyze()).rejects.toBeInstanceOf(JobStoppedError);
        expect((await bench.stored()).status).toBe('analyzing');
      });
    });
  });
});
