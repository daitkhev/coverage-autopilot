import { describe, expect, it } from 'vitest';

import { jobHandlersOf } from '#infrastructure/queue/job-handlers';
import type { JobHandler } from '#ports/job-handler.port';
import type { JobKind } from '#ports/job-queue.port';

function handlerOf(kind: JobKind): JobHandler {
  return {
    kind,
    execute: async () =>
      Promise.resolve({ status: 'finished', outcome: { version: 1 } }),
    onRetriesExhausted: async () => Promise.resolve(),
  };
}

describe('jobHandlersOf', () => {
  it('should give the worker one handler of each kind', () => {
    const handlers = [handlerOf('scan'), handlerOf('improvement')];

    expect(jobHandlersOf(...handlers)).toEqual(handlers);
  });

  describe('when a kind has no handler or two', () => {
    it('should stop the start and name each such kind', () => {
      expect(() => jobHandlersOf(handlerOf('scan'), handlerOf('scan'))).toThrow(
        'Every kind of job needs exactly one handler, and scan has 2, ' +
          'improvement has 0.',
      );
    });
  });
});
