import { z } from 'zod';

import {
  improvementFailureReasonSchema,
  scanFailureReasonSchema,
} from '#api-contracts/statuses';
import { idSchema, textSchema } from '#api-contracts/values';

/**
 * The codes an HTTP answer carries. `stale_snapshot` is missing here
 * because it is already a failure reason, and a code is defined once.
 */
export const apiErrorCodeSchema = z.enum([
  'invalid_request',
  'not_found',
  'improvement_in_progress',
  'work_already_requested',
  'request_key_reused',
  'status_conflict',
  'patch_hash_mismatch',
  'internal_error',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/**
 * The client prints a failed job in the same shape the service answers
 * with, so a failure reason is an error code too.
 */
export const errorCodeSchema = z.union([
  apiErrorCodeSchema,
  improvementFailureReasonSchema,
  scanFailureReasonSchema,
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * `error` is stable and `message` is for people and may change. A conflict
 * with earlier work names that improvement, so the client can open it.
 */
export const errorSchema = z.strictObject({
  error: errorCodeSchema,
  message: textSchema,
  improvementId: idSchema.optional(),
});

export type ErrorBody = z.infer<typeof errorSchema>;
