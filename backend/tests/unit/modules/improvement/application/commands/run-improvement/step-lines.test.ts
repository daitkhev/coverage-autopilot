import { beforeEach, describe, expect, it } from 'vitest';

import { ImprovementHandlerBench } from '#tests/support/improvement-handler-bench';
import { ToolFault } from '#tests/support/improvement-handler-fault';
import {
  improvementIn,
  pullRequestOf,
  skipOf,
} from '#tests/support/improvement-journeys';
import {
  IMPROVEMENT_ID,
  reportOf,
  REPOSITORY_ID,
} from '#tests/support/improvement-values';

const STARTED = 'A step of an improvement started.';
const ENDED = 'A step of an improvement ended.';

/** The fields that tie every line of a step to its journey. */
function journeyOf(step: string): Record<string, unknown> {
  return {
    component: 'improvement-run',
    improvementId: IMPROVEMENT_ID,
    repositoryId: REPOSITORY_ID,
    jobId: 'job-1',
    step,
  };
}

let bench: ImprovementHandlerBench;

beforeEach(() => {
  bench = new ImprovementHandlerBench();
});

describe('RunImprovementHandler', () => {
  describe('when its steps run', () => {
    it('should write the start and the end of each, with the ids of the journey', async () => {
      await bench.store(improvementIn('verifying'));
      bench.stepOf('verifying').saves((improvement, at) => {
        improvement.recordVerdict(reportOf('accepted'), at);
      });
      bench.stepOf('publishing').saves((improvement, at) => {
        improvement.recordPullRequest(pullRequestOf(), at);
      });

      await bench.execute();

      expect(bench.logger.lines).toEqual([
        { level: 'info', message: STARTED, fields: journeyOf('verifying') },
        {
          level: 'info',
          message: ENDED,
          fields: { ...journeyOf('verifying'), outcome: 'publishing' },
        },
        { level: 'info', message: STARTED, fields: journeyOf('publishing') },
        {
          level: 'info',
          message: ENDED,
          fields: { ...journeyOf('publishing'), outcome: 'completed' },
        },
      ]);
    });
  });

  describe('when the handler starts the work', () => {
    it('should write no step for the start, and the step that follows', async () => {
      await bench.store(improvementIn('created'));
      bench.stepOf('analyzing').saves((improvement, at) => {
        improvement.skipWith(skipOf(), at);
      });

      await bench.execute();

      expect(bench.logger.lines.map((line) => line.fields['step'])).toEqual([
        'analyzing',
        'analyzing',
      ]);
      expect(bench.logger.lines.at(-1)?.fields).toMatchObject({
        outcome: 'skipped',
        reason: skipOf().reason,
      });
    });
  });

  describe('when a step fails with a fault that will not pass', () => {
    it('should end it as failed, with the reason and not the message', async () => {
      await bench.store(improvementIn('generating'));
      bench
        .stepOf('generating')
        .does(async () =>
          Promise.reject(
            new ToolFault({ message: 'No CLI.', retryable: false }),
          ),
        );

      await bench.execute();

      expect(bench.logger.lines.at(-1)).toEqual({
        level: 'info',
        message: ENDED,
        fields: {
          ...journeyOf('generating'),
          outcome: 'failed',
          reason: 'generator_unavailable',
        },
      });
    });
  });

  describe('when a step asks for a retry', () => {
    it('should end it as a retry, with the code of the retry', async () => {
      await bench.store(improvementIn('analyzing'));
      const reason = { code: 'tool_busy', message: 'The tool was busy.' };
      bench
        .stepOf('analyzing')
        .does(async () => Promise.resolve({ next: 'retry', reason }));

      await bench.execute();

      expect(bench.logger.lines.at(-1)?.fields).toMatchObject({
        outcome: 'retry',
        reason: 'tool_busy',
      });
    });
  });

  describe('when the job stops during a step', () => {
    it('should end the step as interrupted and leave the rest to the job', async () => {
      await bench.store(improvementIn('analyzing'));
      bench.stepOf('analyzing').does(async (run) => {
        bench.context.stop('worker_shutdown');
        run.signal.throwIfAborted();
        return Promise.resolve({ next: 'continue' });
      });

      await expect(bench.execute()).rejects.toThrow();

      expect(bench.logger.lines.at(-1)).toEqual({
        level: 'info',
        message: ENDED,
        fields: { ...journeyOf('analyzing'), outcome: 'interrupted' },
      });
    });
  });
});
