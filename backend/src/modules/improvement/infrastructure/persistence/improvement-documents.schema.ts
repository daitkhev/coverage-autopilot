import { z } from 'zod';

import { GENERATION_OUTCOMES } from '#improvement/domain/value-objects/generation.vo';
import {
  BILLINGS,
  GENERATOR_CLIS,
} from '#improvement/domain/value-objects/generator-config.vo';
import { FAILURE_REASONS } from '#improvement/domain/value-objects/improvement-failure.vo';
import { IMPROVEMENT_MODES } from '#improvement/domain/value-objects/improvement-mode.vo';
import { SKIP_REASONS } from '#improvement/domain/value-objects/improvement-skip.vo';
import { IMPROVEMENT_STATUSES } from '#improvement/domain/value-objects/improvement-status.vo';
import { MISSED_STATUSES } from '#improvement/domain/value-objects/mutant.vo';
import { CHECK_NAMES } from '#improvement/domain/value-objects/quality-policy.vo';
import {
  TEST_RUN_STATES,
  TYPE_CHECK_STATES,
} from '#improvement/domain/value-objects/verification-baseline.vo';
import {
  CHECK_STATUSES,
  VERDICTS,
} from '#improvement/domain/value-objects/verification-report.vo';

/**
 * The version every document below is written with. A change of a shape
 * keeps the schema of the old version here and converts it when it is
 * read, or a migration rewrites the stored documents.
 */
export const DOCUMENT_VERSION = 1;

const count = z.int().nonnegative();
const text = z.string();
const optionalText = z.string().nullable();

/** A document of the one version this service reads, and nothing more. */
function versioned<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject({ version: z.literal(DOCUMENT_VERSION), ...shape });
}

export const qualityPolicyDocumentSchema = versioned({
  requiredChecks: z.array(z.enum(CHECK_NAMES)),
  repeatedRuns: count,
  mutationThreshold: z.number(),
});

export const generatorConfigDocumentSchema = versioned({
  cli: z.enum(GENERATOR_CLIS),
  model: text,
  promptVersion: text,
  billing: z.enum(BILLINGS),
});

const mutantShape = {
  file: text,
  mutator: text,
  startLine: count,
  startColumn: count,
  endLine: count,
  endColumn: count,
  replacement: text,
};

export const verificationBaselineDocumentSchema = versioned({
  commit: text,
  targetFile: text,
  typeCheck: z.enum(TYPE_CHECK_STATES),
  existingTests: z.enum(TEST_RUN_STATES),
  mutation: z
    .strictObject({
      tool: z.strictObject({ name: text, version: text, testRunner: text }),
      totalMutants: count,
      mutantSetHash: text,
      undetected: z.array(
        z.strictObject({ ...mutantShape, status: z.enum(MISSED_STATUSES) }),
      ),
      cacheReference: optionalText,
    })
    .nullable(),
});

const coverageCount = z.strictObject({ covered: count, total: count });

const targetCoverage = z
  .strictObject({
    statements: coverageCount,
    branches: coverageCount,
    functions: coverageCount,
    lines: coverageCount,
  })
  .nullable();

export const verificationReportDocumentSchema = versioned({
  patchHash: text,
  verdict: z.enum(VERDICTS),
  reasons: z.array(text),
  checks: z.array(
    z.strictObject({
      name: z.enum(CHECK_NAMES),
      status: z.enum(CHECK_STATUSES),
      retryable: z.boolean(),
      durationMs: count.nullable(),
      runs: count.nullable(),
      message: optionalText,
      outputReference: optionalText,
    }),
  ),
  coverageBefore: targetCoverage,
  coverageAfter: targetCoverage,
  mutants: z
    .strictObject({
      undetectedBefore: count,
      killed: count,
      reached: count,
      timedOut: count,
    })
    .nullable(),
  survivingMutants: z.array(
    z.strictObject({ ...mutantShape, reached: z.boolean() }),
  ),
});

/** What the calls of the generator in one attempt left behind. */
export const generationOutputDocumentSchema = versioned({
  outputReferences: z.array(text),
  refusedToolCalls: z.array(text),
});

/** A row of `improvements` as SQLite gives it back. */
export const improvementRowSchema = z.object({
  id: text,
  repository_id: text,
  source_snapshot_id: text,
  baseline_snapshot_id: optionalText,
  base_commit: text,
  target_file: text,
  status: z.enum(IMPROVEMENT_STATUSES),
  mode: z.enum(IMPROVEMENT_MODES),
  failure_reason: z.enum(FAILURE_REASONS).nullable(),
  failure_message: optionalText,
  skip_reason: z.enum(SKIP_REASONS).nullable(),
  skip_message: optionalText,
  request_key: text,
  request_fingerprint: text,
  quality_policy: text,
  generator_config: text,
  max_attempts: count,
  max_tokens: count.nullable(),
  time_limit_ms: count,
  deadline_at: optionalText,
  resumes_at: optionalText,
  limit_waits: count,
  verification_baseline: optionalText,
  branch: optionalText,
  pull_request_number: count.nullable(),
  pull_request_url: optionalText,
  phase_started_at: text,
  version: count,
  created_at: text,
  updated_at: text,
});

export type ImprovementRow = z.infer<typeof improvementRowSchema>;

/** A row of `attempts` as SQLite gives it back. */
export const attemptRowSchema = z.object({
  number: count,
  generation_outcome: z.enum(GENERATION_OUTCOMES).nullable(),
  tokens_used: count.nullable(),
  patch: optionalText,
  patch_hash: optionalText,
  verification_report: optionalText,
  generation_output: optionalText,
  started_at: text,
  finished_at: optionalText,
});

export type AttemptRow = z.infer<typeof attemptRowSchema>;

/** The three columns that name the newest improvement of a file. */
export const latestImprovementRowSchema = z.object({
  id: text,
  target_file: text,
  status: z.enum(IMPROVEMENT_STATUSES),
});

export type LatestImprovementRow = z.infer<typeof latestImprovementRowSchema>;

/** A JSON column, by the schema of its document. */
export function documentOf<Schema extends z.ZodType>(
  json: string,
  schema: Schema,
): z.infer<Schema> {
  return schema.parse(JSON.parse(json));
}
