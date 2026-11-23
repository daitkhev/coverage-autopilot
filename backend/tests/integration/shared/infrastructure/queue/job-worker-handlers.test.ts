import { describe, expect, it } from 'vitest';

import { DuplicateJobHandlerError } from '#infrastructure/queue/errors/duplicate-job-handler.error';
import { JobWorker } from '#infrastructure/queue/job-worker';
import { DEFAULT_JOB_WORKER_SETTINGS } from '#infrastructure/queue/job-worker-settings';
import type { JobHandler } from '#ports/job-handler.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { InlineTransactions } from '#tests/support/inline-transactions';
import { START } from '#tests/support/queue-bench';
import { RecordingLogger } from '#tests/support/recording-logger';
import { ScriptedJobHandler } from '#tests/support/scripted-job-handler';

function workerWith(handlers: readonly JobHandler[]): JobWorker {
  return new JobWorker(
    new InlineTransactions(),
    new FixedClock(START),
    handlers,
    DEFAULT_JOB_WORKER_SETTINGS,
    new RecordingLogger(),
  );
}

describe('JobWorker', () => {
  describe('when it is given two handlers of one kind', () => {
    it('should refuse to be made and name the kind', () => {
      const handlers = [
        new ScriptedJobHandler('scan'),
        new ScriptedJobHandler('improvement'),
        new ScriptedJobHandler('scan'),
      ];

      expect(() => workerWith(handlers)).toThrow(DuplicateJobHandlerError);
      expect(() => workerWith(handlers)).toThrow('of the kind "scan"');
    });
  });

  describe('when it is given one handler of each kind', () => {
    it('should be made', () => {
      const handlers = [
        new ScriptedJobHandler('scan'),
        new ScriptedJobHandler('improvement'),
      ];

      expect(workerWith(handlers)).toBeInstanceOf(JobWorker);
    });
  });
});
