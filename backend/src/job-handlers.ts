import type { JobHandler } from '#ports/job-handler.port';
import type { JobKind } from '#ports/job-queue.port';

/** Every kind of job, so the compiler names a kind that is added later. */
const EVERY_KIND: Readonly<Record<JobKind, true>> = {
  scan: true,
  improvement: true,
};

/**
 * The handlers the worker runs, one for each kind of job. A kind with none
 * would never be claimed, and the worker would keep one of two handlers
 * of a kind without a word, so either stops the start.
 */
export function jobHandlersOf(...handlers: JobHandler[]): JobHandler[] {
  const problems = Object.keys(EVERY_KIND).flatMap((kind) => {
    const count = handlers.filter((handler) => handler.kind === kind).length;
    return count === 1 ? [] : [`${kind} has ${String(count)}`];
  });
  if (problems.length > 0) {
    throw new Error(
      'Every kind of job needs exactly one handler, and ' +
        `${problems.join(', ')}.`,
    );
  }
  return handlers;
}
