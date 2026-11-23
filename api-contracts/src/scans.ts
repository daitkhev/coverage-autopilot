import { z } from 'zod';

import { progressSchema } from '#api-contracts/progress';
import {
  scanFailureReasonSchema,
  scanStatusSchema,
} from '#api-contracts/statuses';
import { idSchema, textSchema, timestampSchema } from '#api-contracts/values';

export const scanFailureSchema = z.strictObject({
  reason: scanFailureReasonSchema,
  message: textSchema,
});

export type ScanFailure = z.infer<typeof scanFailureSchema>;

export const scanSchema = z.strictObject({
  id: idSchema,
  repositoryId: idSchema,
  status: scanStatusSchema,
  queuedAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  progress: progressSchema.nullable(),
  snapshotId: idSchema.nullable(),
  failure: scanFailureSchema.nullable(),
});

export type Scan = z.infer<typeof scanSchema>;
