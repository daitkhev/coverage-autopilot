import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import {
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
const JOB_FIELDS = { component: 'job-worker', kind: 'scan', run: 1 };
const LONGEST_MESSAGE = 2_000;

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

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
    it('should write its start and what it wrote at its end', async () => {
      await one.worker.poll();
      one.handler.latest().finish();
      await one.worker.whenIdle();

      expect(one.logger.lines).toEqual([
        {
          level: 'info',
          message: 'A job started.',
          fields: { ...JOB_FIELDS, jobId, subjectId: 'scan-1' },
        },
        {
          level: 'info',
          message: 'A job ended.',
          fields: {
            ...JOB_FIELDS,
            jobId,
            subjectId: 'scan-1',
            step: 'complete',
          },
        },
      ]);
    });
  });

  describe('when the handler throws', () => {
    it('should write the code and the message of a typed error', async () => {
      await one.worker.poll();
      one.handler.latest().fail(new ToolBusyError('The runner was busy.'));
      await one.worker.whenIdle();

      expect(one.logger.at('error')).toEqual([
        {
          level: 'error',
          message: 'The handler of a job failed.',
          fields: {
            ...JOB_FIELDS,
            jobId,
            subjectId: 'scan-1',
            errorCode: 'tool_busy',
            errorMessage: 'The runner was busy.',
          },
        },
      ]);
      expect(one.logger.lines.at(-1)?.fields).toMatchObject({ step: 'retry' });
    });

    it.each([
      ['an error of no typed kind', new Error('Nobody foresaw it.')],
      ['a thrown text', 'Nobody foresaw it.'],
    ])('should write %s as unexpected', async (_, error) => {
      await one.worker.poll();
      one.handler.latest().fail(error);
      await one.worker.whenIdle();

      expect(one.logger.at('error')[0]?.fields).toMatchObject({
        errorCode: 'unexpected',
        errorMessage: 'Nobody foresaw it.',
      });
      expect(one.logger.lines.at(-1)?.fields).toMatchObject({ step: 'bury' });
    });

    it('should keep only the start of a long message', async () => {
      await one.worker.poll();
      one.handler.latest().fail(new Error('x'.repeat(LONGEST_MESSAGE + 1)));
      await one.worker.whenIdle();

      expect(one.logger.at('error')[0]?.fields['errorMessage']).toBe(
        'x'.repeat(LONGEST_MESSAGE),
      );
    });
  });

  describe('when the worker itself stopped the job', () => {
    it('should not write the abort as a failure of the handler', async () => {
      one.handler.stopWhenAborted();
      await one.worker.poll();

      await one.worker.stop();

      expect(one.logger.at('error')).toEqual([]);
      expect(one.logger.lines.at(-1)?.fields).toMatchObject({
        step: 'release',
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
            ...JOB_FIELDS,
            jobId,
            subjectId: 'scan-1',
            errorCode: 'unexpected',
            errorMessage: 'database is locked',
          },
        },
      ]);
    });
  });
});
