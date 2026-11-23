import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { StaleImprovementError } from '#improvement/domain/errors/stale-improvement.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRunBench } from '#tests/support/improvement-run-bench';
import { IMPROVEMENT_ID } from '#tests/support/improvement-values';

let bench: ImprovementRunBench;

beforeEach(() => {
  bench = new ImprovementRunBench();
});

describe('ImprovementRun', () => {
  it('should name whose work it is and stop on the signal of the job', async () => {
    const run = await bench.runOf(improvementIn('created'));

    expect(run.owner).toBe(`improvement:${IMPROVEMENT_ID}`);
    expect(run.signal.aborted).toBe(false);

    bench.context.stop('worker_shutdown');

    expect(run.signal.aborted).toBe(true);
  });

  it('should pass progress on to the job', async () => {
    const run = await bench.runOf(improvementIn('analyzing'));
    const progress = {
      steps: [{ code: 'prepare', status: 'running' }],
    } as const;

    run.reportProgress(progress);

    expect(bench.context.reported).toEqual([progress]);
  });

  describe('save', () => {
    it('should apply the change at the time of the clock and store it', async () => {
      const run = await bench.runOf(improvementIn('created'));

      await run.save((improvement, at) => {
        improvement.startWork(at);
      });

      const stored = await bench.stored();
      expect(stored.status).toBe('analyzing');
      expect(stored.phaseStartedAt).toEqual(bench.clock.now());
      expect(run.improvement.status).toBe('analyzing');
      expect(run.improvement.version).toBe(stored.version);
    });

    it('should save a second change on top of the first', async () => {
      const run = await bench.runOf(improvementIn('created'));
      await run.save((improvement, at) => {
        improvement.startWork(at);
      });

      await run.save((improvement, at) => {
        improvement.cancel(at);
      });

      expect((await bench.stored()).status).toBe('cancelled');
    });

    it('should run what must be saved with the change in the same transaction', async () => {
      const run = await bench.runOf(improvementIn('created'));
      const seen: unknown[] = [];

      await run.save(
        (improvement, at) => {
          improvement.startWork(at);
        },
        async (transaction, saved) => {
          seen.push(transaction, saved.status);
          return Promise.resolve();
        },
      );

      expect(seen).toEqual([
        bench.context.transactions.transaction,
        'analyzing',
      ]);
      expect(bench.improvements.writes.at(-1)?.transaction).toBe(seen[0]);
    });

    describe('when the aggregate refuses the change', () => {
      it('should keep the improvement it had and store nothing', async () => {
        const run = await bench.runOf(improvementIn('created'));
        const before = run.improvement;

        await expect(
          run.save((improvement, at) => {
            improvement.startGenerating(at);
          }),
        ).rejects.toBeInstanceOf(InvalidTransitionError);

        expect(run.improvement).toBe(before);
        expect((await bench.stored()).status).toBe('created');
      });
    });

    describe('when the lease of the job is lost', () => {
      it('should store nothing and keep the improvement it had', async () => {
        const run = await bench.runOf(improvementIn('created'));
        bench.context.leaseLost = true;

        await expect(
          run.save((improvement, at) => {
            improvement.startWork(at);
          }),
        ).rejects.toBeInstanceOf(LeaseLostError);

        expect(run.improvement.status).toBe('created');
        expect((await bench.stored()).status).toBe('created');
      });
    });

    describe('when the stored version moved since the run read it', () => {
      it('should refuse the save', async () => {
        const run = await bench.runOf(improvementIn('created'));
        const other = await bench.stored();
        other.cancel(bench.clock.now());
        await bench.improvements.save(
          other,
          bench.context.transactions.transaction,
        );

        await expect(
          run.save((improvement, at) => {
            improvement.startWork(at);
          }),
        ).rejects.toBeInstanceOf(StaleImprovementError);

        expect((await bench.stored()).status).toBe('cancelled');
      });
    });
  });
});
