import { z } from 'zod';

import { attemptSchema } from '#api-contracts/attempts';
import { progressSchema } from '#api-contracts/progress';
import {
  checkNameSchema,
  improvementFailureReasonSchema,
  improvementModeSchema,
  improvementStatusSchema,
  skipReasonSchema,
  waitingForSchema,
} from '#api-contracts/statuses';
import {
  commitShaSchema,
  countSchema,
  filePathSchema,
  idSchema,
  ordinalSchema,
  patchHashSchema,
  percentageSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

export const budgetSchema = z.strictObject({
  attempts: ordinalSchema,
  tokens: ordinalSchema,
  minutes: ordinalSchema,
});

export type Budget = z.infer<typeof budgetSchema>;

export const budgetUsageSchema = z.strictObject({
  attempts: countSchema,
  tokens: countSchema,
  seconds: countSchema,
});

export type BudgetUsage = z.infer<typeof budgetUsageSchema>;

export const qualityPolicySchema = z.strictObject({
  requiredChecks: z.array(checkNameSchema),
  repeatedRuns: ordinalSchema,
  mutationThreshold: percentageSchema,
});

export type QualityPolicy = z.infer<typeof qualityPolicySchema>;

export const generatorCliSchema = z.enum(['claude_code']);

export type GeneratorCli = z.infer<typeof generatorCliSchema>;

const generatorChoiceShape = { cli: generatorCliSchema, model: textSchema };

/**
 * Every choice travels in the request, because a long-lived service must
 * not take its own environment as the setting of every later job. What is
 * left out, the service fills with its defaults.
 */
export const startImprovementRequestSchema = z.strictObject({
  snapshotId: idSchema,
  filePath: filePathSchema,
  mode: improvementModeSchema.optional(),
  budget: budgetSchema.partial().optional(),
  qualityPolicy: qualityPolicySchema.optional(),
  generator: z.strictObject(generatorChoiceShape).optional(),
});

export type StartImprovementRequest = z.infer<
  typeof startImprovementRequestSchema
>;

export const generatorConfigSchema = z.strictObject({
  ...generatorChoiceShape,
  promptVersion: textSchema,
});

export type GeneratorConfig = z.infer<typeof generatorConfigSchema>;

export const pullRequestSchema = z.strictObject({
  number: ordinalSchema,
  url: z.url(),
});

export type PullRequest = z.infer<typeof pullRequestSchema>;

/** A reason is a stable code for scripts and a sentence for people. */
export const improvementFailureSchema = z.strictObject({
  reason: improvementFailureReasonSchema,
  message: textSchema,
});

export type ImprovementFailure = z.infer<typeof improvementFailureSchema>;

export const improvementSkipSchema = z.strictObject({
  reason: skipReasonSchema,
  message: textSchema,
});

export type ImprovementSkip = z.infer<typeof improvementSkipSchema>;

export const improvementSchema = z.strictObject({
  id: idSchema,
  repositoryId: idSchema,
  sourceSnapshotId: idSchema,
  baselineSnapshotId: idSchema.nullable(),
  baseCommit: commitShaSchema,
  targetFile: filePathSchema,
  status: improvementStatusSchema,
  mode: improvementModeSchema,
  waitingFor: waitingForSchema.nullable(),
  phaseStartedAt: timestampSchema.nullable(),
  budget: budgetSchema,
  usage: budgetUsageSchema,
  deadlineAt: timestampSchema.nullable(),
  qualityPolicy: qualityPolicySchema,
  generator: generatorConfigSchema,
  attempts: z.array(attemptSchema),
  progress: progressSchema.nullable(),
  branch: textSchema.nullable(),
  pullRequest: pullRequestSchema.nullable(),
  failure: improvementFailureSchema.nullable(),
  skip: improvementSkipSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  cancelledAt: timestampSchema.nullable(),
});

export type Improvement = z.infer<typeof improvementSchema>;

export const improvementListQuerySchema = z.strictObject({
  repositoryId: idSchema.optional(),
  status: improvementStatusSchema.optional(),
});

export type ImprovementListQuery = z.infer<typeof improvementListQuerySchema>;

export const improvementListSchema = z.strictObject({
  items: z.array(improvementSchema),
});

export type ImprovementList = z.infer<typeof improvementListSchema>;

export const improvementPatchSchema = z.strictObject({
  improvementId: idSchema,
  attemptNumber: ordinalSchema,
  patch: z.string().min(1),
  patchHash: patchHashSchema,
});

export type ImprovementPatch = z.infer<typeof improvementPatchSchema>;

/** The hash names the patch the person saw, so a different one is refused. */
export const approveImprovementRequestSchema = z.strictObject({
  patchHash: patchHashSchema,
});

export type ApproveImprovementRequest = z.infer<
  typeof approveImprovementRequestSchema
>;
