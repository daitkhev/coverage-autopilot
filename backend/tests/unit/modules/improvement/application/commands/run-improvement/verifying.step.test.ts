import { beforeEach, describe, expect, it } from 'vitest';

import type { StepResult } from '#improvement/application/commands/run-improvement/improvement-step';
import { VerifyingStep } from '#improvement/application/commands/run-improvement/verifying.step';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { CheckResult } from '#improvement/domain/value-objects/verification-report.vo';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import {
  improvementIn,
  type JourneySpec,
} from '#tests/support/improvement-journeys';
import { ImprovementRunBench } from '#tests/support/improvement-run-bench';
import {
  checkOf,
  IMPROVEMENT_ID,
  patchOf,
} from '#tests/support/improvement-values';
import {
  type StandInGate,
  standInGate,
  TEST_FILE_SUFFIXES,
} from '#tests/support/improvement-verdict-stand-ins';

const TIMED_OUT = 'The type check ran out of time.';

/** A required check that could not finish and may on another run. */
const MAY_FINISH = checkOf('new_tests_pass', 'inconclusive');

/** The same check, when another run cannot help. */
const CANNOT_FINISH: CheckResult = { ...MAY_FINISH, retryable: false };

let bench: ImprovementRunBench;
let gate: StandInGate;
let step: VerifyingStep;

beforeEach(() => {
  bench = new ImprovementRunBench();
  gate = standInGate();
  step = new VerifyingStep(gate, { testFileSuffixes: TEST_FILE_SUFFIXES });
});

/** A report the gate cannot decide on, with one required check in error. */
function inconclusiveWith(check: CheckResult): void {
  gate.answers.push({
    verdict: 'inconclusive',
    reasons: [TIMED_OUT],
    checks: [check],
  });
}

interface Verified {
  readonly result: StepResult;
  readonly stored: Improvement;
}

/** Runs the step once on an improvement that verifies, as a handler would. */
async function verified(spec: JourneySpec = {}): Promise<Verified> {
  const run = await bench.runOf(improvementIn('verifying', spec));
  const result = await step.run(run);
  return { result, stored: await bench.stored() };
}

describe('VerifyingStep', () => {
  it('should do the work of verifying and fail with verification_error', () => {
    expect(step.status).toBe('verifying');
    expect(step.faultReason).toBe('verification_error');
  });

  it('should verify the stored patch of the open attempt as its own work', async () => {
    const { text, hash } = patchOf();

    await verified();

    expect(gate.requests).toHaveLength(1);
    expect(gate.requests[0]?.patch).toEqual({ text, hash });
    expect(gate.requests[0]?.owner).toBe(
      `improvement:${IMPROVEMENT_ID}:attempt:1`,
    );
    expect(gate.requests[0]?.testFileSuffixes).toEqual(TEST_FILE_SUFFIXES);
  });

  describe('when the gate accepts the patch', () => {
    it('should keep the report and publish', async () => {
      const { result, stored } = await verified();

      expect(result).toEqual({ next: 'continue' });
      expect(stored.status).toBe('publishing');
      expect(stored.acceptedAttempt?.report?.verdict).toBe('accepted');
      expect(stored.currentAttempt).toBeNull();
    });

    it('should wait for a person in review mode', async () => {
      const { stored } = await verified({ mode: 'review' });

      expect(stored.status).toBe('awaiting_approval');
    });
  });

  describe('when the gate rejects the patch', () => {
    it('should close the attempt with its report and generate again', async () => {
      gate.answers.push({ verdict: 'rejected' });

      const { result, stored } = await verified();

      expect(result).toEqual({ next: 'continue' });
      expect(stored.status).toBe('generating');
      expect(stored.lastRejectedAttempt?.number).toBe(1);
      expect(stored.currentAttempt).toBeNull();
    });
  });

  describe('when the gate cannot decide and a run again may help', () => {
    it('should keep the report with the open attempt and ask for a retry', async () => {
      inconclusiveWith(MAY_FINISH);

      const { result, stored } = await verified();

      expect(result).toEqual({
        next: 'retry',
        reason: expect.objectContaining({
          code: 'verification_inconclusive',
        }) as unknown,
      });
      expect(stored.status).toBe('verifying');
      expect(stored.currentAttempt?.report?.verdict).toBe('inconclusive');
    });

    it('should let the same attempt take the report of the next run', async () => {
      inconclusiveWith(MAY_FINISH);
      const run = await bench.runOf(improvementIn('verifying'));
      await step.run(run);

      await step.run(run);

      const stored = await bench.stored();
      const { hash } = patchOf();
      expect(gate.requests.map(({ patch }) => patch.hash)).toEqual([
        hash,
        hash,
      ]);
      expect(stored.attempts).toHaveLength(1);
      expect(stored.acceptedAttempt?.number).toBe(1);
      expect(stored.status).toBe('publishing');
    });
  });

  describe('when the gate cannot decide and a run again cannot help', () => {
    it('should keep the report and fail the improvement with its reasons', async () => {
      inconclusiveWith(CANNOT_FINISH);

      const { result, stored } = await verified();

      expect(result).toEqual({ next: 'continue' });
      expect(stored.status).toBe('failed');
      expect(stored.failure?.reason).toBe('verification_error');
      expect(stored.failure?.message).toContain(TIMED_OUT);
      expect(stored.attempts[0]?.report?.verdict).toBe('inconclusive');
    });
  });

  describe('when the gate reports its checks', () => {
    it('should show the seven checks, then each change, then none', async () => {
      gate.progress.push(
        { check: 'repeated_runs', status: 'running', done: 2, total: 3 },
        { check: 'repeated_runs', status: 'passed' },
      );

      await verified();

      const { reported } = bench.context;
      expect(reported).toHaveLength(4);
      expect(reported[0]?.steps.map(({ status }) => status)).toEqual(
        Array<string>(7).fill('pending'),
      );
      expect(reported[1]?.steps[4]).toEqual({
        code: 'repeated_runs',
        status: 'running',
        done: 2,
        total: 3,
      });
      expect(reported[2]?.steps[4]).toEqual({
        code: 'repeated_runs',
        status: 'passed',
      });
      expect(reported[3]).toEqual({ steps: [] });
    });
  });

  describe('when the job is stopped', () => {
    it('should let the stop pass and save nothing', async () => {
      const run = await bench.runOf(improvementIn('verifying'));
      bench.context.stop('user_cancelled');

      await expect(step.run(run)).rejects.toBeInstanceOf(JobStoppedError);

      const stored = await bench.stored();
      expect(stored.status).toBe('verifying');
      expect(stored.currentAttempt?.report).toBeNull();
    });
  });
});
