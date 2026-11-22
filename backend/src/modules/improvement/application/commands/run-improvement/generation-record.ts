import { waitEndOf } from '#improvement/application/commands/run-improvement/generation-wait';
import type { Change } from '#improvement/application/commands/run-improvement/run-failures';
import type {
  GenerationReport,
  GenerationResult,
} from '#improvement/application/ports/test-generator.port';
import type {
  Generation,
  GeneratorCall,
} from '#improvement/domain/value-objects/generation.vo';
import { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import type { Instant } from '#kernel/time/instant';
import type { PatchDto } from '#repositories/application/contracts/repositories-public-api';

/**
 * What a working copy held once its call ended. `tampered`: the call
 * wrote a `.git` into it, so git was not run there and no patch was taken.
 */
export type CopyContent =
  | { readonly state: 'patch'; readonly patch: PatchDto }
  | { readonly state: 'unchanged' }
  | { readonly state: 'tampered' };

/** How a call of the generator ended, and what it left in its copy. */
export interface FinishedCall {
  readonly result: GenerationResult;
  /** Read only after a call that generated: any other leaves no patch. */
  readonly copy: CopyContent;
}

/**
 * No reason of the contract names a run that the repository steered, and
 * `generator_unavailable` would send a person to a CLI that started and
 * ran well. Only that content can have told the run to write a `.git`,
 * and the run held the credential while it obeyed, so the credential is
 * taken as exposed: the one reason that asks a person for what fits.
 */
const STEERED_RUN = {
  reason: 'credential_exposed',
  message:
    'The generator wrote a .git into its working copy, which content of ' +
    'the repository must have steered it to. Nothing it wrote was used, ' +
    'and the credential it ran with is to be taken as exposed.',
} as const;

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
  const { result, copy } = finished;
  const call = callOf(result);
  switch (result.outcome) {
    case 'generated':
      return copy.state === 'patch'
        ? {
            ...call,
            outcome: 'generated',
            patch: TestPatch.create({
              text: copy.patch.text,
              hash: copy.patch.hash,
            }),
          }
        : { ...call, outcome: 'no_changes' };
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

/**
 * What one call changes in its improvement. A call that tampered with its
 * copy was paid for all the same, so what it spent is kept as the
 * improvement fails.
 */
export function recordOf(
  finished: FinishedCall,
  now: Instant,
  limitWaitMs: number,
): Change {
  if (finished.copy.state === 'tampered') {
    const unusable = {
      call: callOf(finished.result),
      failure: ImprovementFailure.create(STEERED_RUN),
    };
    return (improvement, at) => {
      improvement.failAfterCall(unusable, at);
    };
  }
  const generation = generationOf(finished, now, limitWaitMs);
  return (improvement, at) => {
    improvement.recordGeneration(generation, at);
  };
}
