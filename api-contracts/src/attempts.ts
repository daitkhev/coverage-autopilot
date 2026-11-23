import { z } from 'zod';

import { coverageCountersSchema } from '#api-contracts/coverage';
import {
  attemptStatusSchema,
  checkNameSchema,
  checkStatusSchema,
  generationOutcomeSchema,
  verdictSchema,
} from '#api-contracts/statuses';
import {
  countSchema,
  filePathSchema,
  ordinalSchema,
  patchHashSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

/**
 * What a failed run of tests said first, in a few short lines of the
 * runner. `test` is `null` when the file failed before any test ran.
 */
export const testFailureSchema = z.strictObject({
  file: filePathSchema,
  test: textSchema.nullable(),
  lines: z.array(textSchema).min(1),
});

export type TestFailure = z.infer<typeof testFailureSchema>;

/**
 * `retryable` matters for `error` only: it says whether a rerun can help.
 * Only a failed check that ran tests names a `testFailure`.
 */
export const checkResultSchema = z.strictObject({
  name: checkNameSchema,
  status: checkStatusSchema,
  retryable: z.boolean(),
  durationMs: countSchema.nullable(),
  runs: countSchema.nullable(),
  message: textSchema.nullable(),
  testFailure: testFailureSchema.nullable(),
});

export type CheckResult = z.infer<typeof checkResultSchema>;

/** What the new tests add, not the score the mutation tool prints. */
export const mutantCountsSchema = z.strictObject({
  undetectedBefore: countSchema,
  killed: countSchema,
  reached: countSchema,
});

export type MutantCounts = z.infer<typeof mutantCountsSchema>;

/** Feedback for the next attempt names a concrete place in the target. */
export const survivingMutantSchema = z.strictObject({
  line: ordinalSchema,
  mutator: textSchema,
  replacement: textSchema,
  reached: z.boolean(),
});

export type SurvivingMutant = z.infer<typeof survivingMutantSchema>;

export const verificationReportSchema = z.strictObject({
  patchHash: patchHashSchema,
  verdict: verdictSchema,
  reasons: z.array(textSchema),
  checks: z.array(checkResultSchema),
  /** `null` when the gate stopped before it measured the target. */
  coverageBefore: coverageCountersSchema.nullable(),
  coverageAfter: coverageCountersSchema.nullable(),
  mutants: mutantCountsSchema.nullable(),
  survivingMutants: z.array(survivingMutantSchema),
});

export type VerificationReport = z.infer<typeof verificationReportSchema>;

/**
 * Raw output lives in the instance directory, outside the repository, so
 * its paths are plain text and not repository paths.
 */
export const attemptSchema = z.strictObject({
  number: ordinalSchema,
  status: attemptStatusSchema,
  startedAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
  generationOutcome: generationOutcomeSchema.nullable(),
  tokensUsed: countSchema,
  patchHash: patchHashSchema.nullable(),
  report: verificationReportSchema.nullable(),
  rawOutputPaths: z.array(textSchema),
});

export type Attempt = z.infer<typeof attemptSchema>;
