import { z } from 'zod';

import { stepStatusSchema } from '#api-contracts/statuses';
import {
  countSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

/** A step is a hint for people, so its code is free text, not a status. */
export const progressStepSchema = z.strictObject({
  code: textSchema,
  status: stepStatusSchema,
  done: countSchema.optional(),
  total: countSchema.optional(),
});

export type ProgressStep = z.infer<typeof progressStepSchema>;

/** The time of the last write lets the client show a stalled worker. */
export const progressSchema = z.strictObject({
  steps: z.array(progressStepSchema),
  updatedAt: timestampSchema,
});

export type Progress = z.infer<typeof progressSchema>;
