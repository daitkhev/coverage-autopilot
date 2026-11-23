import { z } from 'zod';

import { attemptSchema } from '#api-contracts/attempts';
import { progressSchema } from '#api-contracts/progress';
import {
  billingSchema,
  checkNameSchema,
  generatorCliSchema,
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

/**
 * No limit of tokens is `null`: under a subscription its own windows of
 * usage hold the generator, and a count of tokens says little.
 */
export const budgetSchema = z.strictObject({
  attempts: ordinalSchema,
  tokens: ordinalSchema.nullable(),
  minutes: ordinalSchema,
});

export type Budget = z.infer<typeof budgetSchema>;

/**
 * What the service fills a request with, and the most it accepts, so the
 * dialog that starts an improvement holds no number of its own.
 */
export const budgetSettingsSchema = z.strictObject({
  defaults: budgetSchema,
  maximums: budgetSchema,
});

export type BudgetSettings = z.infer<typeof budgetSettingsSchema>;

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

/** The service knows who pays from its own settings, not the request. */
export const generatorConfigSchema = z.strictObject({
  ...generatorChoiceShape,
  promptVersion: textSchema,
  billing: billingSchema,
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
  /** When the window of the subscription opens. Set only while it waits. */
  resumesAt: timestampSchema.nullable(),
  /** A wait spends no attempt and no minute, so it has a count of its own. */
  limitWaits: countSchema,
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

/** The history of one file is the list filtered by its path. */
export const improvementListQuerySchema = z.strictObject({
  repositoryId: idSchema.optional(),
  status: improvementStatusSchema.optional(),
  filePath: filePathSchema.optional(),
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
