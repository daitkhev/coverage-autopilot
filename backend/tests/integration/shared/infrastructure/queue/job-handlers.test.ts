import { describe, expect, it } from 'vitest';

import { DuplicateJobHandlerError } from '#infrastructure/queue/errors/duplicate-job-handler.error';
import {
  handlersByKind,
  jobHandlersOf,
} from '#infrastructure/queue/job-handlers';
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

  describe('when a kind has no handler', () => {
    it('should stop the start and name each such kind', () => {
      expect(() => jobHandlersOf(handlerOf('scan'), handlerOf('scan'))).toThrow(
        'Every kind of job needs a handler, and improvement has none.',
      );
    });
  });
});

describe('handlersByKind', () => {
  it('should find each handler by its kind', () => {
    const scan = handlerOf('scan');
    const improvement = handlerOf('improvement');

    const byKind = handlersByKind([scan, improvement]);

    expect(byKind.get('scan')).toBe(scan);
    expect(byKind.get('improvement')).toBe(improvement);
  });

  describe('when two handlers have one kind', () => {
    it('should refuse the second with a typed error that names the kind', () => {
      const handlers = [handlerOf('improvement'), handlerOf('improvement')];

      expect(() => handlersByKind(handlers)).toThrow(
        new DuplicateJobHandlerError(
          'Two handlers were given for the jobs of the kind "improvement", ' +
            'and the worker runs each kind with one.',
        ),
      );
    });
  });
});
