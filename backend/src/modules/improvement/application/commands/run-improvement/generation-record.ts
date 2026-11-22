import { waitEndOf } from '#improvement/application/commands/run-improvement/generation-wait';
import type {
  GenerationReport,
  GenerationResult,
} from '#improvement/application/ports/test-generator.port';
import type {
  Generation,
  GeneratorCall,
} from '#improvement/domain/value-objects/generation.vo';
import { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import type { Instant } from '#kernel/time/instant';
import type { PatchDto } from '#repositories/contracts/repositories-public-api';

/** How a call of the generator ended, and the patch it left behind. */
export interface FinishedCall {
  readonly result: GenerationResult;
  /**
   * Taken from the working copy only after a call that generated, and
   * `null` when that call left the copy as its commit was.
   */
  readonly patch: PatchDto | null;
}

function callOf(report: GenerationReport): GeneratorCall {
  const { tokensUsed, outputReference, refusedToolCalls } = report;
  return { tokensUsed, outputReference, refusedToolCalls };
}

/**
 * The call as the improvement records it. A call that says it generated
 * and changed nothing is recorded as such, and a spent window with the
 * moment the wait for it ends.
 */
export function generationOf(
  finished: FinishedCall,
  now: Instant,
  limitWaitMs: number,
): Generation {
  const { result, patch } = finished;
  const call = callOf(result);
  switch (result.outcome) {
    case 'generated':
      return patch === null
        ? { ...call, outcome: 'no_changes' }
        : {
            ...call,
            outcome: 'generated',
            patch: TestPatch.create({ text: patch.text, hash: patch.hash }),
          };
    case 'window_exhausted':
      return {
        ...call,
        outcome: 'window_exhausted',
        resumesAt: waitEndOf(result, now, limitWaitMs),
      };
    default:
      return { ...call, outcome: result.outcome };
  }
}
