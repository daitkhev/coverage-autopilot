import { z } from 'zod';

import {
  coverageCountersSchema,
  thresholdSchema,
} from '#api-contracts/coverage';
import {
  coverageMetricSchema,
  fileStateSchema,
  improvementStatusSchema,
  unmeasuredReasonSchema,
} from '#api-contracts/statuses';
import {
  commitShaSchema,
  countSchema,
  filePathSchema,
  idSchema,
  ordinalSchema,
  percentageSchema,
  textSchema,
  timestampSchema,
} from '#api-contracts/values';

/** How the files divide, so a list of repositories needs one request. */
export const fileSplitSchema = z.strictObject({
  below: countSchema,
  above: countSchema,
  unmeasured: countSchema,
  noCode: countSchema,
});

export type FileSplit = z.infer<typeof fileSplitSchema>;

/**
 * How many tests of the repository ran in the run of a snapshot, and how
 * many of them failed. A file that failed to run counts as one of each.
 * The coverage holds what ran even when some failed.
 */
export const testCountsSchema = z.strictObject({
  ran: countSchema,
  failed: countSchema,
});

export type TestCounts = z.infer<typeof testCountsSchema>;

const snapshotSummaryShape = {
  id: idSchema,
  commitSha: commitShaSchema,
  capturedAt: timestampSchema,
  totals: coverageCountersSchema,
  threshold: thresholdSchema,
  files: fileSplitSchema,
  /**
   * `null` when the runner wrote no report of its tests that the service
   * could read, and for a snapshot taken before the tests were counted.
   */
  tests: testCountsSchema.nullable(),
};

export const snapshotSummarySchema = z.strictObject(snapshotSummaryShape);

export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;

/** Numbers compare only between snapshots measured the same way. */
export const scanParametersSchema = z.strictObject({
  testRunner: textSchema,
  testRunnerVersion: textSchema,
  coverageProvider: textSchema,
  packageManager: textSchema,
  configFile: filePathSchema.nullable(),
  fileListRule: textSchema,
});

export type ScanParameters = z.infer<typeof scanParametersSchema>;

export const snapshotSchema = z.strictObject({
  ...snapshotSummaryShape,
  repositoryId: idSchema,
  parameters: scanParametersSchema,
});

export type Snapshot = z.infer<typeof snapshotSchema>;

/** Newest first. */
export const snapshotListSchema = z.strictObject({
  items: z.array(snapshotSchema),
});

export type SnapshotList = z.infer<typeof snapshotListSchema>;

/** A query string carries text, so the number is read from it. */
export const snapshotFilesQuerySchema = z.strictObject({
  below: z.coerce.number().pipe(percentageSchema).optional(),
  metric: coverageMetricSchema.optional(),
  state: fileStateSchema.optional(),
});

export type SnapshotFilesQuery = z.infer<typeof snapshotFilesQuerySchema>;

export const lineRangeSchema = z.strictObject({
  start: ordinalSchema,
  end: ordinalSchema,
});

export type LineRange = z.infer<typeof lineRangeSchema>;

export const uncoveredFunctionSchema = z.strictObject({
  name: textSchema,
  line: ordinalSchema,
});

export type UncoveredFunction = z.infer<typeof uncoveredFunctionSchema>;

/** The Work column of the files screen. */
export const improvementRefSchema = z.strictObject({
  id: idSchema,
  status: improvementStatusSchema,
});

export type ImprovementRef = z.infer<typeof improvementRefSchema>;

export const measuredFileSchema = z.strictObject({
  path: filePathSchema,
  state: z.literal(fileStateSchema.enum.measured),
  coverage: coverageCountersSchema,
  belowThreshold: z.boolean(),
  uncoveredLines: z.array(lineRangeSchema),
  openBranchLines: z.array(ordinalSchema),
  uncoveredFunctions: z.array(uncoveredFunctionSchema),
  latestImprovement: improvementRefSchema.nullable(),
});

export type MeasuredFile = z.infer<typeof measuredFileSchema>;

/** A file of type declarations only is never a target. */
export const noCodeFileSchema = z.strictObject({
  path: filePathSchema,
  state: z.literal(fileStateSchema.enum.no_executable_code),
});

export type NoCodeFile = z.infer<typeof noCodeFileSchema>;

/** It has no percentage at all, because 0% would be a lie. */
export const unmeasuredFileSchema = z.strictObject({
  path: filePathSchema,
  state: z.literal(fileStateSchema.enum.unmeasured),
  reason: unmeasuredReasonSchema,
  toolMessage: textSchema.nullable(),
});

export type UnmeasuredFile = z.infer<typeof unmeasuredFileSchema>;

export const fileCoverageSchema = z.discriminatedUnion('state', [
  measuredFileSchema,
  noCodeFileSchema,
  unmeasuredFileSchema,
]);

export type FileCoverage = z.infer<typeof fileCoverageSchema>;

export const snapshotFilesSchema = z.strictObject({
  snapshotId: idSchema,
  threshold: thresholdSchema,
  items: z.array(fileCoverageSchema),
});

export type SnapshotFiles = z.infer<typeof snapshotFilesSchema>;
