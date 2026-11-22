import { beforeEach, describe, expect, it } from 'vitest';

import { resumeJobOf } from '#improvement/application/commands/run-improvement/improvement-jobs';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import { GeneratingStepBench } from '#tests/support/improvement-generation-bench';
import {
  CALL_REPORT,
  resultOf,
  windowSpent,
} from '#tests/support/improvement-generation-results';
import {
  improvementIn,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  budgetOf,
  IMPROVEMENT_ID,
  minutesIn,
  patchOf,
  reportOf,
  REPOSITORY_ID,
  TARGET_FILE,
  windowSpentUntil,
} from '#tests/support/improvement-values';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';

const MS_PER_MINUTE = 60_000;

let bench: GeneratingStepBench;

beforeEach(() => {
  bench = new GeneratingStepBench();
});

/** Whose the copy and the raw output of attempt `n` are. */
function ownerOf(attempt: number): string {
  return `improvement:${IMPROVEMENT_ID}:attempt:${String(attempt)}`;
}

/** Runs the step once, which always goes on, and reads what it saved. */
async function storedAfterRun(improvement: Improvement): Promise<Improvement> {
  expect(await bench.run(improvement)).toEqual({ next: 'continue' });
  return bench.stored();
}

/** Moves the clock of the run to the minute after the creation. */
function clockAt(minute: number): void {
  const now = bench.runs.clock.now().epochMilliseconds;
  bench.runs.clock.advance(minutesIn(minute).epochMilliseconds - now);
}

/** The improvement whose first attempt waited for the window and resumed. */
function resumedOnce(): Improvement {
  const improvement = improvementIn('waiting_for_limit');
  improvement.resume(WINDOW_OPENS_AT);
  clockAt(61);
  return improvement;
}

/** The improvement whose first attempt waited twice and resumed. */
function resumedTwice(): Improvement {
  const improvement = resumedOnce();
  improvement.recordGeneration(windowSpentUntil(minutesIn(120)), minutesIn(61));
  improvement.resume(minutesIn(120));
  clockAt(121);
  return improvement;
}

/** The improvement whose first patch the gate rejected. */
function rejectedOnce(budget = budgetOf()): Improvement {
  const improvement = improvementIn('verifying', { budget });
  improvement.recordVerdict(reportOf('rejected'), minutesIn(6));
  return improvement;
}

describe('GeneratingStep', () => {
  it('should do the work of generating, and fail a fault as a generator that is unavailable', () => {
    expect(bench.step.status).toBe('generating');
    expect(bench.step.faultReason).toBe('generator_unavailable');
  });

  describe('run', () => {
    it('should open an attempt and generate in a working copy of its own at the base commit', async () => {
      await storedAfterRun(improvementIn('generating'));

      expect(bench.repositories.created).toEqual([
        {
          repositoryId: RepositoryId.create(REPOSITORY_ID),
          commit: CommitSha.create(BASE_COMMIT),
          purpose: ownerOf(1),
        },
      ]);
      expect(bench.generator.requests).toEqual([
        expect.objectContaining({
          workingCopyPath: WORKING_COPY_PATH,
          owner: ownerOf(1),
          testRunner: 'vitest',
          feedback: null,
        }),
      ]);
    });

    it('should describe the target from the fresh snapshot', async () => {
      await storedAfterRun(improvementIn('generating'));

      expect(bench.coverage.snapshotReads).toEqual([
        { snapshotId: BASELINE_SNAPSHOT_ID },
      ]);
      expect(bench.coverage.fileReads).toEqual([
        {
          snapshotId: BASELINE_SNAPSHOT_ID,
          path: FilePath.create(TARGET_FILE),
        },
      ]);
    });

    it('should save the patch with the call, and move on to verifying', async () => {
      const stored = await storedAfterRun(improvementIn('generating'));

      const attempt = stored.currentAttempt;
      expect(stored.status).toBe('verifying');
      expect(attempt?.number).toBe(1);
      expect(attempt?.startedAt).toEqual(bench.runs.clock.now());
      expect(attempt?.patch).toEqual(patchOf());
      expect(attempt?.tokensUsed).toBe(CALL_REPORT.tokensUsed);
      expect(attempt?.outputReferences).toEqual([CALL_REPORT.outputReference]);
      expect(attempt?.refusedToolCalls).toEqual(CALL_REPORT.refusedToolCalls);
    });

    it('should clear the steps a gate run left, since the generator reports none', async () => {
      await storedAfterRun(improvementIn('generating'));

      expect(bench.runs.context.reported).toEqual([{ steps: [] }]);
    });

    it('should take the patch once the call returned, and throw the copy away after', async () => {
      const seen: unknown[] = [];
      bench.generator.onGenerate = () => {
        seen.push([...bench.repositories.extracted]);
        seen.push([...bench.repositories.disposed]);
      };

      await storedAfterRun(improvementIn('generating'));

      expect(seen).toEqual([[], []]);
      expect(bench.repositories.extracted).toEqual(['copy-1']);
      expect(bench.repositories.disposed).toEqual(['copy-1']);
    });

    describe('when an attempt is open after a crash', () => {
      it('should generate as that attempt and open no other', async () => {
        const improvement = improvementIn('generating');
        improvement.openAttempt(minutesIn(4));

        const stored = await storedAfterRun(improvement);

        expect(stored.attempts).toHaveLength(1);
        expect(stored.currentAttempt?.startedAt).toEqual(minutesIn(4));
        expect(bench.repositories.created[0]?.purpose).toBe(ownerOf(1));
      });
    });

    describe('when the window opened again after a wait', () => {
      it('should generate again as the attempt that waited', async () => {
        const stored = await storedAfterRun(resumedOnce());

        expect(stored.status).toBe('verifying');
        expect(stored.attempts).toHaveLength(1);
        expect(bench.generator.requests[0]?.owner).toBe(ownerOf(1));
      });
    });

    describe('when the gate rejected the last patch', () => {
      it('should open the next attempt and tell the generator why', async () => {
        const stored = await storedAfterRun(rejectedOnce());

        expect(stored.attempts).toHaveLength(2);
        expect(stored.currentAttempt?.number).toBe(2);
        expect(bench.repositories.created[0]?.purpose).toBe(ownerOf(2));
        expect(bench.generator.requests[0]?.feedback?.reasons).toEqual([
          'The new test does not pass.',
        ]);
      });
    });

    describe('when no attempt is open and the budget allows none', () => {
      it('should fail the improvement and call nothing', async () => {
        const stored = await storedAfterRun(
          rejectedOnce(budgetOf({ attempts: 1 })),
        );

        expect(stored.failure?.reason).toBe('budget_exhausted');
        expect(stored.failure?.message).toContain('limit of attempts');
        expect(stored.attempts).toHaveLength(1);
        expect(bench.repositories.created).toEqual([]);
        expect(bench.generator.requests).toEqual([]);
        expect(bench.runs.context.reported).toEqual([]);
      });
    });

    describe('when the fresh snapshot is gone', () => {
      it('should fail the improvement as stale before an attempt opens', async () => {
        bench.coverage.snapshot = null;

        const stored = await storedAfterRun(improvementIn('generating'));

        expect(stored.failure?.reason).toBe('stale_snapshot');
        expect(stored.attempts).toEqual([]);
        expect(bench.coverage.fileReads).toEqual([]);
        expect(bench.repositories.created).toEqual([]);
      });
    });

    describe('when the copy is as its commit was after the call', () => {
      it('should close the attempt as one that changed nothing', async () => {
        bench.repositories.extraction = { outcome: 'empty' };

        const stored = await storedAfterRun(improvementIn('generating'));

        expect(stored.status).toBe('generating');
        expect(stored.attempts[0]?.outcome).toBe('no_changes');
        expect(stored.attempts[0]?.isOpen).toBe(false);
        expect(stored.attempts[0]?.tokensUsed).toBe(CALL_REPORT.tokensUsed);
      });
    });

    describe('when the call left nothing to verify', () => {
      it.each(['no_changes', 'limit_reached'] as const)(
        'should close the attempt after %s and take no patch',
        async (outcome) => {
          bench.generator.answer = resultOf(outcome);

          const stored = await storedAfterRun(improvementIn('generating'));

          expect(stored.status).toBe('generating');
          expect(stored.attempts[0]?.outcome).toBe(outcome);
          expect(stored.attempts[0]?.isOpen).toBe(false);
          expect(bench.repositories.extracted).toEqual([]);
          expect(bench.repositories.disposed).toEqual(['copy-1']);
        },
      );

      it.each(['quota_exhausted', 'credential_exposed'] as const)(
        'should fail the improvement with %s and take no patch',
        async (outcome) => {
          bench.generator.answer = resultOf(outcome);

          const stored = await storedAfterRun(improvementIn('generating'));

          expect(stored.failure?.reason).toBe(outcome);
          expect(stored.attempts[0]?.tokensUsed).toBe(CALL_REPORT.tokensUsed);
          expect(bench.repositories.extracted).toEqual([]);
          expect(bench.repositories.disposed).toEqual(['copy-1']);
        },
      );
    });

    describe('when the five-hour window is spent', () => {
      it('should wait until the moment the generator named, and save the job that ends the wait with it', async () => {
        bench.generator.answer = windowSpent(minutesIn(90));

        const stored = await storedAfterRun(improvementIn('generating'));

        const write = bench.runs.improvements.writes.at(-1);
        expect(stored.status).toBe('waiting_for_limit');
        expect(stored.resumesAt).toEqual(minutesIn(90));
        expect(stored.attempts[0]?.isOpen).toBe(true);
        expect(bench.queue.enqueued).toEqual([
          {
            request: resumeJobOf(stored, minutesIn(90)),
            transaction: write?.transaction,
          },
        ]);
        expect(bench.queue.enqueued[0]?.request.idempotencyKey).toBe(
          `improvement:${IMPROVEMENT_ID}:resume:1`,
        );
      });

      it('should wait as long as the settings say when no moment is known', async () => {
        bench.generator.answer = windowSpent(null);

        const stored = await storedAfterRun(improvementIn('generating'));

        const waitEnd = minutesIn(10).plusMilliseconds(60 * MS_PER_MINUTE);
        expect(stored.resumesAt).toEqual(waitEnd);
        expect(bench.queue.enqueued[0]?.request.notBefore).toEqual(waitEnd);
      });

      describe('when it is spent a third time', () => {
        it('should leave the domain to fail the improvement, and add no job', async () => {
          bench.generator.answer = windowSpent(minutesIn(200));

          const stored = await storedAfterRun(resumedTwice());

          expect(stored.status).toBe('failed');
          expect(stored.failure?.reason).toBe('quota_exhausted');
          expect(bench.queue.enqueued).toEqual([]);
        });
      });
    });

    describe('when the generator raises a fault', () => {
      it('should let it pass, throw the copy away and record no call', async () => {
        const fault = new Error('The CLI is not logged in.');
        bench.generator.answer = fault;

        await expect(bench.run(improvementIn('generating'))).rejects.toBe(
          fault,
        );

        const stored = await bench.stored();
        expect(stored.status).toBe('generating');
        expect(stored.currentAttempt?.tokensUsed).toBe(0);
        expect(bench.repositories.disposed).toEqual(['copy-1']);
      });
    });

    describe('when the job is stopped during the call', () => {
      it('should let the stop pass and throw the copy away', async () => {
        bench.generator.onGenerate = () => {
          bench.runs.context.stop('user_cancelled');
        };

        await expect(
          bench.run(improvementIn('generating')),
        ).rejects.toBeInstanceOf(JobStoppedError);

        expect(bench.repositories.extracted).toEqual([]);
        expect(bench.repositories.disposed).toEqual(['copy-1']);
      });
    });
  });
});
