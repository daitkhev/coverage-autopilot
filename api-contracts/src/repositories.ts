import { z } from 'zod';

import { thresholdSchema } from '#api-contracts/coverage';
import { snapshotSummarySchema } from '#api-contracts/snapshots';
import {
  accessCheckNameSchema,
  accessCheckStatusSchema,
} from '#api-contracts/statuses';
import {
  commitShaSchema,
  idSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

const URL_MAX_LENGTH = 2048;
const PERCENTAGE_MAX = 100;

/** The service clones over HTTPS, so another scheme is refused early. */
export const connectRepositoryRequestSchema = z.strictObject({
  url: z.url({ protocol: /^https$/ }).max(URL_MAX_LENGTH),
});

export type ConnectRepositoryRequest = z.infer<
  typeof connectRepositoryRequestSchema
>;

/**
 * What the files of a repository are judged by now. A repository without
 * a threshold of its own has the default of the service.
 */
export const repositoryThresholdSchema = z.strictObject({
  ...thresholdSchema.shape,
  isDefault: z.boolean(),
});

export type RepositoryThreshold = z.infer<typeof repositoryThresholdSchema>;

const LEAST_THRESHOLD = 1;

/**
 * A whole percent of its own for a repository, read in the metric of the
 * service, or `null` to give it the default back. 0 would make no file a
 * target, so the least is 1.
 */
export const changeThresholdRequestSchema = z.strictObject({
  percentage: z.int().min(LEAST_THRESHOLD).max(PERCENTAGE_MAX).nullable(),
});

export type ChangeThresholdRequest = z.infer<
  typeof changeThresholdRequestSchema
>;

export const repositorySchema = z.strictObject({
  id: idSchema,
  owner: textSchema,
  name: textSchema,
  url: z.url(),
  defaultBranch: textSchema,
  connectedAt: timestampSchema,
  latestSnapshot: snapshotSummarySchema.nullable(),
  activeScanId: idSchema.nullable(),
  /** The head of the default branch, as the last access check saw it. */
  headCommit: commitShaSchema.nullable(),
  /** The head moved past the commit of the latest snapshot. */
  outdated: z.boolean(),
  threshold: repositoryThresholdSchema,
});

export type Repository = z.infer<typeof repositorySchema>;

export const repositoryListSchema = z.strictObject({
  items: z.array(repositorySchema),
});

export type RepositoryList = z.infer<typeof repositoryListSchema>;

/** The answer of the tool that refused is kept, so the user can act on it. */
export const accessStepSchema = z.strictObject({
  name: accessCheckNameSchema,
  status: accessCheckStatusSchema,
  message: textSchema.nullable(),
  toolOutput: textSchema.nullable(),
});

export type AccessStep = z.infer<typeof accessStepSchema>;

/**
 * Where the branch and the pull request of a result go: the repository
 * when the account may push to it, and otherwise a fork in the account
 * that `gh` is logged in with.
 */
export const destinationSchema = z.discriminatedUnion('route', [
  z.strictObject({ route: z.literal('repository') }),
  z.strictObject({ route: z.literal('fork'), account: textSchema }),
]);

export type Destination = z.infer<typeof destinationSchema>;

export const accessCheckSchema = z.strictObject({
  repositoryId: idSchema,
  checkedAt: timestampSchema,
  passed: z.boolean(),
  /** Read with the last step, so a check that stopped early has none. */
  headCommit: commitShaSchema.nullable(),
  /** Known with the last step, as the head is. */
  destination: destinationSchema.nullable(),
  steps: z.array(accessStepSchema),
});

export type AccessCheck = z.infer<typeof accessCheckSchema>;
