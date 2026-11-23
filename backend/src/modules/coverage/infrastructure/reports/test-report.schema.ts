import { z } from 'zod';

/** A test as both runners list it. Only what names a failure is read. */
const testSchema = z.looseObject({
  fullName: z.string(),
  status: z.string(),
  failureMessages: z.array(z.string()),
});

/**
 * A test file. Its `message` says why it failed when none of its tests
 * did, such as a file that failed to run: then it lists no test at all.
 */
const testFileSchema = z.looseObject({
  name: z.string(),
  status: z.string(),
  message: z.string(),
  assertionResults: z.array(testSchema),
});

/** The JSON report of the tests of Jest, which Vitest writes in its shape. */
export const testReportSchema = z.looseObject({
  testResults: z.array(testFileSchema),
});

export type TestReport = z.infer<typeof testReportSchema>;

export type TestFileResult = TestReport['testResults'][number];
