import { DuplicateJobHandlerError } from '#infrastructure/queue/errors/duplicate-job-handler.error';
import type { JobHandler } from '#ports/job-handler.port';
import type { JobKind } from '#ports/job-queue.port';

/** Every kind of job, so the compiler names a kind that is added later. */
const EVERY_KIND: Readonly<Record<JobKind, true>> = {
  scan: true,
  improvement: true,
};

/**
 * The handlers the worker registers, by their kind. A second handler of
 * a kind would take the place of the first without a word, so it stops
 * the start and names the kind.
 */
export function handlersByKind(
  handlers: readonly JobHandler[],
): ReadonlyMap<string, JobHandler> {
  const byKind = new Map<string, JobHandler>();
  for (const handler of handlers) {
    if (byKind.has(handler.kind)) {
      throw new DuplicateJobHandlerError(
        `Two handlers were given for the jobs of the kind "${handler.kind}", ` +
          'and the worker runs each kind with one.',
      );
    }
    byKind.set(handler.kind, handler);
  }
  return byKind;
}

/**
 * The handlers of the service, as the composition gives them to the
 * worker. A kind with none would never be claimed, so it stops the start.
 * The worker refuses a second handler of a kind itself.
 */
export function jobHandlersOf(...handlers: JobHandler[]): JobHandler[] {
  const missing = Object.keys(EVERY_KIND).filter((kind) =>
    handlers.every((handler) => handler.kind !== kind),
  );
  if (missing.length > 0) {
    throw new Error(
      `Every kind of job needs a handler, and ${missing.join(' and ')} ` +
        'has none.',
    );
  }
  return handlers;
}
