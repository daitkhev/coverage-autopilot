import { z } from 'zod';

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

/** The service clones over HTTPS, so another scheme is refused early. */
export const connectRepositoryRequestSchema = z.strictObject({
  url: z.url({ protocol: /^https$/ }).max(URL_MAX_LENGTH),
});

export type ConnectRepositoryRequest = z.infer<
  typeof connectRepositoryRequestSchema
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

export const accessCheckSchema = z.strictObject({
  repositoryId: idSchema,
  checkedAt: timestampSchema,
  passed: z.boolean(),
  /** Read with the last step, so a check that stopped early has none. */
  headCommit: commitShaSchema.nullable(),
  steps: z.array(accessStepSchema),
});

export type AccessCheck = z.infer<typeof accessCheckSchema>;
