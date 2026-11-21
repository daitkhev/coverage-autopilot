import { z } from 'zod';

import {
  countSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

/**
 * Raised on every change of a schema in this package. A client that sees
 * another number restarts an idle service rather than talk to it.
 */
export const CONTRACT_VERSION = 1;

export const toolVersionSchema = z.strictObject({
  name: textSchema,
  version: textSchema.nullable(),
});

export type ToolVersion = z.infer<typeof toolVersionSchema>;

/** A stopped worker means queued work will not move. */
export const workerStateSchema = z.strictObject({
  alive: z.boolean(),
  lastSeenAt: timestampSchema.nullable(),
});

export type WorkerState = z.infer<typeof workerStateSchema>;

/** A busy service is not restarted for a new version. */
export const activeWorkSchema = z.strictObject({
  scans: countSchema,
  improvements: countSchema,
});

export type ActiveWork = z.infer<typeof activeWorkSchema>;

/**
 * The version is any positive number, not this package's own, because the
 * client must read the answer of an older or a newer service.
 */
export const healthSchema = z.strictObject({
  ready: z.boolean(),
  contractVersion: z.int().positive(),
  serviceVersion: textSchema,
  startedAt: timestampSchema,
  githubAccount: textSchema.nullable(),
  worker: workerStateSchema,
  activeWork: activeWorkSchema,
  tools: z.array(toolVersionSchema),
});

export type Health = z.infer<typeof healthSchema>;
