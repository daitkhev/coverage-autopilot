import { beforeEach, describe, expect, it } from 'vitest';

import { RunImprovementHandler } from '#improvement/application/commands/run-improvement/run-improvement.handler';
import { MissingStepError } from '#improvement/application/errors/missing-step.error';
import { StalledStepError } from '#improvement/application/errors/stalled-step.error';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import type { DeadJobContext } from '#ports/job-handler.port';
import { ImprovementHandlerBench } from '#tests/support/improvement-handler-bench';
import { ToolFault } from '#tests/support/improvement-handler-fault';
import {
  improvementIn,
  pullRequestOf,
  skipOf,
} from '#tests/support/improvement-journeys';
import {
  IMPROVEMENT_ID,
  minutesIn,
  reportOf,
} from '#tests/support/improvement-values';
import { StandInJobContext } from '#tests/support/stand-in-job-context';

const MINUTE_MS = 60_000;

/** The deadline of the journeys: work starts at minute 1 with 30 minutes. */
const DEADLINE_MINUTE = 31;

let bench: ImprovementHandlerBench;

beforeEach(() => {
  bench = new ImprovementHandlerBench();
});

function finishedAs(outcome: string): unknown {
  return { status: 'finished', outcome: { version: 1, outcome } };
}

async function endedAs(): Promise<unknown> {
  const { status, failure } = await bench.stored();
  return { status, reason: failure?.reason };
}

function deadContext(subjectId: string = IMPROVEMENT_ID): DeadJobContext {
  return { jobId: 'job-1', subjectId, payload: null, runs: 3 };
}

/** The improvement analyzes, and its step throws what it is given. */
async function analyzingThrows(error: Error): Promise<void> {
  await bench.store(improvementIn('analyzing'));
  bench.stepOf('analyzing').does(async () => Promise.reject(error));
}

describe('RunImprovementHandler', () => {
  it('should run the jobs of the kind improvement', () => {
    expect(bench.handler().kind).toBe('improvement');
  });

  describe('execute', () => {
    it('should run the step of each status until the improvement ends', async () => {
      await bench.store(improvementIn('verifying'));
      bench.stepOf('verifying').saves((improvement, at) => {
        improvement.recordVerdict(reportOf('accepted'), at);
      });
      bench.stepOf('publishing').saves((improvement, at) => {
        improvement.recordPullRequest(pullRequestOf(), at);
      });

      expect(await bench.execute()).toEqual(finishedAs('completed'));
      expect((await bench.stored()).status).toBe('completed');
      expect(bench.stepOf('publishing').runs).toHaveLength(1);
    });

    it('should start the work and keep an alarm at the deadline while it runs', async () => {
      await bench.store(improvementIn('created'));
      const pendingDuringStep: unknown[] = [];
      bench.stepOf('analyzing').does(async (run) => {
        pendingDuringStep.push(...bench.alarm.pending);
        await run.save((improvement, at) => {
          improvement.skipWith(skipOf(), at);
        });
        return { next: 'continue' };
      });

      expect(await bench.execute()).toEqual(finishedAs('skipped'));
      expect(pendingDuringStep).toEqual([
        bench.clock.now().plusMilliseconds(30 * MINUTE_MS),
      ]);
      expect(bench.alarm.pending).toEqual([]);
    });

    describe('when the job stops during a step', () => {
      it('should stop the signal of the step for that reason and throw it on', async () => {
        await bench.store(improvementIn('analyzing'));
        const step = bench.stepOf('analyzing');
        step.does(async (run) => {
          bench.context.stop('worker_shutdown');
          run.signal.throwIfAborted();
          return Promise.resolve({ next: 'continue' });
        });

        await expect(bench.execute()).rejects.toBeInstanceOf(JobStoppedError);
        const signal = step.runs[0]?.signal ?? null;
        expect(signal).not.toBe(bench.context.signal);
        expect(signal?.reason).toBe(bench.context.signal.reason);
        expect((await bench.stored()).status).toBe('analyzing');
        expect(bench.alarm.pending).toEqual([]);
      });
    });

    describe('when the improvement is not in the store', () => {
      it('should finish with not_found', async () => {
        expect(await bench.execute()).toEqual(finishedAs('not_found'));
        expect(
          await bench.handler().execute(new StandInJobContext('acme/shop')),
        ).toEqual(finishedAs('not_found'));
      });
    });

    describe('when the improvement is over, waits for approval or for a window', () => {
      it.each(['completed', 'awaiting_approval', 'waiting_for_limit'] as const)(
        'should finish a job of one that is %s and save nothing',
        async (status) => {
          await bench.store(improvementIn(status));

          expect(await bench.execute()).toEqual(finishedAs(status));
          expect(bench.improvements.writes).toHaveLength(1);
        },
      );
    });

    describe('when the window has opened', () => {
      it('should go on generating, with the alarm at the deadline the wait moved', async () => {
        await bench.store(improvementIn('waiting_for_limit'));
        bench.clock.advance(50 * MINUTE_MS);
        bench.stepOf('generating').saves((improvement, at) => {
          improvement.cancel(at);
        });

        expect(await bench.execute()).toEqual(finishedAs('cancelled'));
        expect(bench.stepOf('generating').runs).toHaveLength(1);
        expect(bench.alarm.moments).toEqual([minutesIn(86)]);
      });
    });

    describe('when the payload has a version this service does not read', () => {
      it('should fail an improvement that is not over and finish the job', async () => {
        await bench.store(improvementIn('created'));
        bench.context.payload = { version: 2 };

        expect(await bench.execute()).toEqual(finishedAs('failed'));
        expect(await endedAs()).toEqual({
          status: 'failed',
          reason: 'retries_exhausted',
        });
        expect(bench.stepOf('analyzing').runs).toEqual([]);
      });

      it('should leave an improvement that is over as it is', async () => {
        await bench.store(improvementIn('skipped'));
        bench.context.payload = { version: 2 };

        expect(await bench.execute()).toEqual(finishedAs('skipped'));
        expect(bench.improvements.writes).toHaveLength(1);
      });
    });

    describe('when a step asks for a retry', () => {
      it('should return the retry to the worker', async () => {
        await bench.store(improvementIn('analyzing'));
        const reason = { code: 'tool_busy', message: 'The tool was busy.' };
        bench
          .stepOf('analyzing')
          .does(async () => Promise.resolve({ next: 'retry', reason }));

        expect(await bench.execute()).toEqual({ status: 'retry', reason });
      });
    });

    describe('when a step goes on and saves nothing', () => {
      it('should throw, since it would run for ever', async () => {
        await bench.store(improvementIn('analyzing'));

        await expect(bench.execute()).rejects.toBeInstanceOf(StalledStepError);
        expect(bench.stepOf('analyzing').runs).toHaveLength(1);
      });
    });

    describe('when no step does the work of the status', () => {
      it('should throw a fault of the binding', async () => {
        await bench.store(improvementIn('analyzing'));
        const { improvements, clock, alarm, transactions, logger } = bench;
        const handler = new RunImprovementHandler(
          improvements,
          [],
          clock,
          alarm,
          transactions,
          logger,
        );

        await expect(handler.execute(bench.context)).rejects.toBeInstanceOf(
          MissingStepError,
        );
      });
    });

    describe('when the deadline has passed before a step', () => {
      it('should fail with budget_exhausted and run no step', async () => {
        await bench.store(improvementIn('analyzing'));
        bench.clock.advance((DEADLINE_MINUTE - 10) * MINUTE_MS);

        expect(await bench.execute()).toEqual(finishedAs('failed'));
        expect(await endedAs()).toEqual({
          status: 'failed',
          reason: 'budget_exhausted',
        });
        expect(bench.stepOf('analyzing').runs).toEqual([]);
      });
    });

    describe('when the deadline comes during a step', () => {
      it('should stop the step and fail with budget_exhausted', async () => {
        await bench.store(improvementIn('analyzing'));
        bench.stepOf('analyzing').does(async (run) => {
          bench.alarm.ring();
          run.signal.throwIfAborted();
          return Promise.resolve({ next: 'continue' });
        });

        expect(await bench.execute()).toEqual(finishedAs('failed'));
        const { signal } = bench.stepOf('analyzing').runs[0] ?? bench.context;
        expect(JobStoppedError.reasonOf(signal)).toBe('deadline_exceeded');
        expect(await endedAs()).toMatchObject({ reason: 'budget_exhausted' });
      });
    });

    describe('when a step fails with a fault that may pass', () => {
      it('should ask for a retry with its code and message', async () => {
        await analyzingThrows(
          new ToolFault({ message: 'The sandbox stopped.', retryable: true }),
        );

        expect(await bench.execute()).toEqual({
          status: 'retry',
          reason: { code: 'tool_unavailable', message: 'The sandbox stopped.' },
        });
        expect((await bench.stored()).status).toBe('analyzing');
      });
    });

    describe('when a step fails with a fault that will not pass', () => {
      it('should fail with the reason of that step and finish', async () => {
        await bench.store(improvementIn('generating'));
        bench
          .stepOf('generating')
          .does(async () =>
            Promise.reject(
              new ToolFault({ message: 'No CLI.', retryable: false }),
            ),
          );

        expect(await bench.execute()).toEqual(finishedAs('failed'));
        expect(await endedAs()).toEqual({
          status: 'failed',
          reason: 'generator_unavailable',
        });
      });
    });

    describe('when a step fails with an error nobody foresaw', () => {
      it('should throw it on and save nothing', async () => {
        await analyzingThrows(new TypeError('x is not a function'));

        await expect(bench.execute()).rejects.toBeInstanceOf(TypeError);
        expect((await bench.stored()).status).toBe('analyzing');
      });
    });

    describe('when the start of the work cannot be saved', () => {
      it('should ask for a retry when the fault may pass', async () => {
        await bench.store(improvementIn('created'));
        bench.improvements.refuseNextSave(
          new ToolFault({ message: 'The database is busy.', retryable: true }),
        );

        expect(await bench.execute()).toMatchObject({ status: 'retry' });
        expect((await bench.stored()).status).toBe('created');
      });

      it('should throw a fault that will not pass, since no step ran', async () => {
        await bench.store(improvementIn('created'));
        bench.improvements.refuseNextSave(
          new ToolFault({ message: 'The disk is full.', retryable: false }),
        );

        await expect(bench.execute()).rejects.toBeInstanceOf(ToolFault);
      });
    });
  });

  describe('onRetriesExhausted', () => {
    it('should fail an improvement at work in a transaction of its own', async () => {
      await bench.store(improvementIn('verifying'));

      await bench.handler().onRetriesExhausted(deadContext());

      expect(await endedAs()).toEqual({
        status: 'failed',
        reason: 'retries_exhausted',
      });
      expect(bench.transactions.runs).toBe(1);
    });

    it('should leave an improvement that is over as it is', async () => {
      await bench.store(improvementIn('completed'));

      await bench.handler().onRetriesExhausted(deadContext());

      expect(bench.improvements.writes).toHaveLength(1);
    });

    it('should change nothing when no improvement is found', async () => {
      await bench.handler().onRetriesExhausted(deadContext());
      await bench.handler().onRetriesExhausted(deadContext('acme/shop'));

      expect(bench.improvements.writes).toEqual([]);
    });
  });
});
