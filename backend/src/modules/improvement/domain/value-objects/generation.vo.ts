import type { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import type { Instant } from '#kernel/time/instant';

/**
 * How a call of the generator ended. `window_exhausted`: the short window
 * of a subscription is spent and opens again later, so the improvement
 * waits. `quota_exhausted`: no usage is left for days, so it fails.
 */
export const GENERATION_OUTCOMES = [
  'generated',
  'no_changes',
  'limit_reached',
  'window_exhausted',
  'quota_exhausted',
  'credential_exposed',
] as const;

export type GenerationOutcome = (typeof GENERATION_OUTCOMES)[number];

/** What every call reports, also one that produced no test. */
export interface GeneratorCall {
  /** Input and output tokens together. */
  readonly tokensUsed: number;
  /** The raw output of the CLI in the store of raw output. */
  readonly outputReference: string | null;
  /** Tool calls the CLI refused: a sign the repository tried to steer it. */
  readonly refusedToolCalls: readonly string[];
}

/**
 * One call of the generator, as the improvement records it. A generated
 * test comes with its patch, taken from the working copy once the call
 * ended, and a spent window with the moment it opens again.
 */
export type Generation =
  | (GeneratorCall & {
      readonly outcome: 'generated';
      readonly patch: TestPatch;
    })
  | (GeneratorCall & {
      readonly outcome: 'window_exhausted';
      readonly resumesAt: Instant;
    })
  | (GeneratorCall & {
      readonly outcome: Exclude<
        GenerationOutcome,
        'generated' | 'window_exhausted'
      >;
    });
