import { z } from 'zod';

import { billingSchema, generatorCliSchema } from '#api-contracts/statuses';
import {
  countSchema,
  percentageSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

/**
 * Raised on every change of a schema in this package. A client that sees
 * another number restarts an idle service rather than talk to it.
 */
export const CONTRACT_VERSION = 2;

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

/** One window of usage of a subscription, as the generator reports it. */
export const limitWindowSchema = z.strictObject({
  usedPercent: percentageSchema,
  resetsAt: timestampSchema,
});

export type LimitWindow = z.infer<typeof limitWindowSchema>;

/**
 * What the generator last said of the subscription. It is as old as the
 * last call, so it carries the moment it was seen. A window the generator
 * did not name is `null`.
 */
export const subscriptionLimitsSchema = z.strictObject({
  observedAt: timestampSchema,
  fiveHour: limitWindowSchema.nullable(),
  sevenDay: limitWindowSchema.nullable(),
});

export type SubscriptionLimits = z.infer<typeof subscriptionLimitsSchema>;

/** The limits are `null` with a key, and before the first call. */
export const generatorAccountSchema = z.strictObject({
  cli: generatorCliSchema,
  billing: billingSchema,
  limits: subscriptionLimitsSchema.nullable(),
});

export type GeneratorAccount = z.infer<typeof generatorAccountSchema>;

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
  generator: generatorAccountSchema,
  worker: workerStateSchema,
  activeWork: activeWorkSchema,
  tools: z.array(toolVersionSchema),
});

export type Health = z.infer<typeof healthSchema>;

/**
 * The answer of an idle service that was asked to stop. A service with
 * running work refuses with a conflict, and nothing changes.
 */
export const stopServiceResultSchema = z.strictObject({
  stopping: z.literal(true),
});

export type StopServiceResult = z.infer<typeof stopServiceResultSchema>;
