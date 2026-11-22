import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import {
  GADGETS,
  QueueBench,
  type QueueProcess,
  scanOf,
  WIDGETS,
} from '#tests/support/queue-bench';

class ToolBusyError extends InfrastructureError {
  public readonly code = 'tool_busy';
  public readonly retryable = true;
}

const SCAN = scanOf(WIDGETS, 'scan-1');
const LONGEST_MESSAGE = 2_000;
const RUN_MS = 1_500;

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

/** The fields every line of the job carries, at its first attempt. */
function jobFields(attempt = 1): Record<string, unknown> {
  return {
    component: 'job-worker',
    jobId,
    kind: 'scan',
    subjectId: 'scan-1',
    repositoryId: WIDGETS.value,
    attempt,
  };
}

/** A payload the queue would never store: a document with no version. */
function corruptPayload(id: string): void {
  bench.connection
    .prepare(`UPDATE jobs SET payload = '{"branch":"main"}' WHERE id = ?`)
    .run(id);
}

function messages(): string[] {
  return one.logger.lines.map((line) => line.message);
}

beforeEach(async () => {
  bench = new QueueBench();
  one = await bench.open({ maxRuns: 3 });
  jobId = (await one.enqueue(SCAN)).jobId;
});

afterEach(() => {
  bench.remove();
});

describe('JobWorker', () => {
  describe('when a job runs to its end', () => {
    it('should write that it was taken, and its end with what it took', async () => {
      await one.worker.poll();
      bench.clock.advance(RUN_MS);
      one.handler.latest().finish({ version: 1, outcome: 'captured' });
      await one.worker.whenIdle();

      expect(one.logger.lines).toEqual([
        { level: 'info', message: 'A job was taken.', fields: jobFields() },
        {
          level: 'info',
          message: 'A job ended.',
          fields: {
            ...jobFields(),
            outcome: 'completed',
            result: 'captured',
            durationMs: RUN_MS,
          },
        },
      ]);
    });
  });

  describe('when the handler asks for a retry', () => {
    it('should write that the job was put back, with the code of the retry', async () => {
      await one.worker.poll();
      one.handler.latest().retry();
      await one.worker.whenIdle();

      expect(one.logger.at('warn')).toEqual([
        {
          level: 'warn',
          message: 'A job was put back in the queue.',
          fields: { ...jobFields(), reason: 'tool_busy' },
        },
      ]);
      expect(one.logger.lines.at(-1)?.fields).toMatchObject({
        outcome: 'put_back',
      });
    });
  });

  describe('when the handler throws', () => {
    it('should write the fault, and put back a job a rerun can help', async () => {
      await one.worker.poll();
      one.handler.latest().fail(new ToolBusyError('The runner was busy.'));
      await one.worker.whenIdle();

      expect(one.logger.at('error')).toEqual([
        {
          level: 'error',
          message: 'The handler of a job failed.',
          fields: {
            ...jobFields(),
            errorCode: 'tool_busy',
            errorMessage: 'The runner was busy.',
          },
        },
      ]);
      expect(one.logger.at('warn')[0]?.fields).toMatchObject({
        reason: 'tool_busy',
      });
    });

    it.each([
      ['an error of no typed kind', new Error('Nobody foresaw it.')],
      ['a thrown text', 'Nobody foresaw it.'],
    ])(
      'should write %s as unexpected and give the job up',
      async (_, error) => {
        await one.worker.poll();
        one.handler.latest().fail(error);
        await one.worker.whenIdle();

        expect(one.logger.at('error')[0]?.fields).toMatchObject({
          errorCode: 'unexpected',
          errorMessage: 'Nobody foresaw it.',
        });
        expect(messages()).toEqual([
          'A job was taken.',
          'The handler of a job failed.',
          'A job was given up: it will not run again.',
          'A job ended.',
        ]);
        expect(one.logger.lines.at(-1)?.fields).toMatchObject({
          outcome: 'given_up',
        });
      },
    );

    it('should keep only the start of a long message', async () => {
      await one.worker.poll();
      one.handler.latest().fail(new Error('x'.repeat(LONGEST_MESSAGE + 1)));
      await one.worker.whenIdle();

      expect(one.logger.at('error')[0]?.fields['errorMessage']).toBe(
        'x'.repeat(LONGEST_MESSAGE),
      );
    });
  });

  describe('when the runs of a job are spent', () => {
    it('should write that it was given up at its last attempt', async () => {
      const last = await bench.open({ maxRuns: 1 });
      await last.worker.poll();
      last.handler.latest().retry();
      await last.worker.whenIdle();

      expect(last.logger.lines.map((line) => line.message)).toEqual([
        'A job was taken.',
        'A job was given up: it will not run again.',
        'A job ended.',
      ]);
      expect(last.logger.at('error')[0]?.fields).toEqual(jobFields());
    });
  });

  describe('when the worker itself stopped the job', () => {
    it('should write it as put back, and not as a failure', async () => {
      one.handler.stopWhenAborted();
      await one.worker.poll();

      await one.worker.stop();

      expect(one.logger.at('error')).toEqual([]);
      expect(one.logger.at('warn')[0]?.fields).toMatchObject({
        reason: 'worker_shutdown',
      });
      expect(one.logger.lines.at(-1)?.fields).toMatchObject({
        outcome: 'put_back',
      });
    });
  });

  describe('when the job lost its lease while it ran', () => {
    it('should write that it stopped, and why', async () => {
      one.handler.stopWhenAborted();
      await one.worker.poll();
      const two = await bench.open();
      bench.clock.advance(one.settings.leaseMs);
      await two.worker.poll();

      await one.worker.heartbeat();
      await one.worker.whenIdle();

      expect(one.logger.at('error')).toEqual([]);
      expect(one.logger.lines.at(-1)).toMatchObject({
        message: 'A job ended.',
        fields: { outcome: 'stopped', reason: 'lease_lost' },
      });
    });
  });

  describe('when the database refuses the claim', () => {
    it('should write a warning and claim at the next poll', async () => {
      one.transactions.refuseNext();

      await one.worker.poll();
      expect(one.logger.at('warn')).toEqual([
        {
          level: 'warn',
          message: 'No job could be claimed.',
          fields: {
            component: 'job-worker',
            errorCode: 'unexpected',
            errorMessage: 'database is locked',
          },
        },
      ]);
      await one.worker.poll();

      expect(one.handler.runs).toHaveLength(1);
    });
  });

  describe('when the database refuses the end of a job', () => {
    it('should write that the end is not written', async () => {
      await one.worker.poll();

      one.transactions.refuseNext();
      one.handler.latest().finish();
      await one.worker.whenIdle();

      expect(one.logger.at('error')).toEqual([
        {
          level: 'error',
          message: 'The end of a job could not be written.',
          fields: {
            ...jobFields(),
            errorCode: 'unexpected',
            errorMessage: 'database is locked',
          },
        },
      ]);
      expect(messages()).not.toContain('A job ended.');
    });
  });

  describe('when the stored payload of a job cannot be read', () => {
    it('should bury the job, tell its handler and never run it', async () => {
      corruptPayload(jobId);

      await one.worker.poll();
      await one.worker.whenIdle();

      expect(one.handler.runs).toEqual([]);
      expect(one.handler.exhausted).toEqual([
        { jobId, subjectId: 'scan-1', payload: null, runs: 1 },
      ]);
      expect(bench.stored(jobId)).toMatchObject({
        status: 'dead',
        lease_expires_at: null,
      });
      expect(one.logger.at('error')).toEqual([
        {
          level: 'error',
          message:
            'The stored payload of a job cannot be read, so the job is dead.',
          fields: jobFields(),
        },
      ]);
      expect(one.logger.lines.at(-1)?.fields).toMatchObject({
        outcome: 'given_up',
      });
    });

    it('should go on with the jobs behind it', async () => {
      corruptPayload(jobId);
      const next = await one.enqueue(scanOf(WIDGETS, 'scan-2'));
      const other = await one.enqueue(scanOf(GADGETS, 'scan-3'));

      await one.worker.poll();
      one.handler.latest().finish();
      await one.worker.whenIdle();
      await one.worker.poll();

      expect(bench.stored(other.jobId)).toMatchObject({ status: 'completed' });
      expect(bench.stored(next.jobId)).toMatchObject({ status: 'leased' });
    });

    it('should bury it also when its runs are spent already', async () => {
      await one.worker.poll();
      corruptPayload(jobId);
      const two = await bench.open({ maxRuns: 1 });

      bench.clock.advance(one.settings.leaseMs);
      await two.worker.poll();
      await two.worker.whenIdle();

      expect(two.handler.exhausted).toMatchObject([{ jobId, payload: null }]);
      expect(bench.stored(jobId)).toMatchObject({ status: 'dead' });
    });

    it('should not extend a lease or write progress for it', async () => {
      corruptPayload(jobId);
      one.handler.refuseNextExhausted();
      await one.worker.poll();

      await one.worker.heartbeat();
      await one.worker.writeProgress();
      await one.worker.whenIdle();

      expect(bench.stored(jobId)).toMatchObject({
        status: 'leased',
        lease_expires_at: bench.leaseEnd(one.settings),
      });
    });
  });
});
