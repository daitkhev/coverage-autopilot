import { z } from 'zod';

import {
  PACKAGE_MANAGERS,
  TEST_RUNNER_NAMES,
} from '#coverage/domain/value-objects/detected-project.vo';
import { UNMEASURED_REASONS } from '#coverage/domain/value-objects/unmeasured-file.vo';
import { InvalidStoredDocumentError } from '#coverage/infrastructure/errors/invalid-stored-document.error';
import { UnknownDocumentVersionError } from '#coverage/infrastructure/errors/unknown-document-version.error';

/**
 * The version every document below is written with. A change of a shape
 * keeps the schema of the old version here and converts it when it is
 * read, or a migration rewrites the stored documents.
 */
export const DOCUMENT_VERSION = 1;

const count = z.int().nonnegative();
const line = z.int().positive();
const word = z.string().min(1);

export const detectedProjectDocumentSchema = z.strictObject({
  version: z.literal(DOCUMENT_VERSION),
  testRunner: z.enum(TEST_RUNNER_NAMES),
  testRunnerVersion: word,
  packageManager: z.enum(PACKAGE_MANAGERS),
  configFile: z.string().nullable(),
});

export const scanParametersDocumentSchema = z.strictObject({
  version: z.literal(DOCUMENT_VERSION),
  testRunner: z.enum(TEST_RUNNER_NAMES),
  testRunnerVersion: word,
  coverageProvider: word,
  fileListRule: word,
});

/**
 * The version the document of the unmeasured files is written with. The
 * second counts the tests of the run beside its raw output.
 */
export const UNMEASURED_FILES_VERSION = 2;

/** The newest version of each document that changed since the first. */
const NEWEST_VERSIONS: Readonly<Record<string, number>> = {
  unmeasured_files: UNMEASURED_FILES_VERSION,
};

const unmeasuredFilesShape = {
  testRunOutput: z.string().nullable(),
  files: z.array(
    z.strictObject({
      path: z.string(),
      reason: z.enum(UNMEASURED_REASONS),
      toolMessage: z.string().nullable(),
    }),
  ),
};

/** The first version, read as the second: its tests were not counted. */
const firstUnmeasuredFilesSchema = z
  .strictObject({
    version: z.literal(DOCUMENT_VERSION),
    ...unmeasuredFilesShape,
  })
  .transform((document) => ({ ...document, tests: null }));

const secondUnmeasuredFilesSchema = z.strictObject({
  version: z.literal(UNMEASURED_FILES_VERSION),
  ...unmeasuredFilesShape,
  tests: z.strictObject({ ran: count, failed: count }).nullable(),
});

/**
 * The files with no numbers, the raw output that says why, and how many
 * tests of the run ran and failed, in the shape of the second version.
 */
export const unmeasuredFilesDocumentSchema = z.union([
  secondUnmeasuredFilesSchema,
  firstUnmeasuredFilesSchema,
]);

/**
 * The `uncovered` column of a file: what of it never ran. The counters
 * are columns. The fourth migration took the two that were kept here out
 * of every stored document, so this shape is the only one of version 1.
 */
export const uncoveredDocumentSchema = z.strictObject({
  version: z.literal(DOCUMENT_VERSION),
  uncoveredLines: z.array(z.strictObject({ start: line, end: line })),
  openBranchLines: z.array(line),
  uncoveredFunctions: z.array(z.strictObject({ name: z.string(), line })),
});

export const snapshotRowSchema = z.object({
  id: z.string(),
  repository_id: z.string(),
  commit_sha: z.string(),
  origin_key: z.string(),
  detected_project: z.string(),
  scan_parameters: z.string(),
  unmeasured_files: z.string(),
  captured_at: z.string(),
});

export const fileRowSchema = z.object({
  file_path: z.string(),
  state: z.enum(['measured', 'no_executable_code']),
  lines_covered: count,
  lines_total: count,
  branches_covered: count,
  branches_total: count,
  statements_covered: count,
  statements_total: count,
  functions_covered: count,
  functions_total: count,
  uncovered: z.string(),
});

const versionedSchema = z.looseObject({ version: z.unknown() });

function isKnown(version: unknown, newest: number): boolean {
  return (
    Number.isInteger(version) &&
    Number(version) >= DOCUMENT_VERSION &&
    Number(version) <= newest
  );
}

function versionWords(newest: number): string {
  return newest === DOCUMENT_VERSION
    ? `the version ${String(DOCUMENT_VERSION)}`
    : `the versions ${String(DOCUMENT_VERSION)} to ${String(newest)}`;
}

/**
 * Parses a JSON column. A version this code does not know is told apart
 * from a broken document, because only the first one can be fixed by a
 * newer service.
 */
export function readDocument<Schema extends z.ZodType>(
  column: string,
  text: string,
  schema: Schema,
): z.infer<Schema> {
  const json: unknown = JSON.parse(text);
  const version = versionedSchema.safeParse(json).data?.version;
  const newest = NEWEST_VERSIONS[column] ?? DOCUMENT_VERSION;
  if (!isKnown(version, newest)) {
    throw new UnknownDocumentVersionError(
      `The ${column} document has the version ${String(version)}, and this ` +
        `service reads ${versionWords(newest)}.`,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidStoredDocumentError(
      `The ${column} document does not have its shape: ` +
        z.prettifyError(parsed.error),
    );
  }
  return parsed.data;
}
