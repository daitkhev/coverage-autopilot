import { z } from 'zod';

import { coverageMetricSchema } from '#api-contracts/statuses';
import { countSchema, percentageSchema } from '#api-contracts/values';

/**
 * The percentage travels with its counts, so the client computes nothing.
 * It is null when the total is zero: no code of that kind is not 0%.
 */
export const coverageCounterSchema = z.strictObject({
  covered: countSchema,
  total: countSchema,
  percentage: percentageSchema.nullable(),
});

export type CoverageCounter = z.infer<typeof coverageCounterSchema>;

export const coverageCountersSchema = z.strictObject({
  statements: coverageCounterSchema,
  branches: coverageCounterSchema,
  functions: coverageCounterSchema,
  lines: coverageCounterSchema,
});

export type CoverageCounters = z.infer<typeof coverageCountersSchema>;

export const thresholdSchema = z.strictObject({
  metric: coverageMetricSchema,
  percentage: percentageSchema,
});

export type Threshold = z.infer<typeof thresholdSchema>;
