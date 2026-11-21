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

const counterSchema = z.strictObject({ covered: count, total: count });

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

/** The files with no numbers, and the raw output that says why. */
export const unmeasuredFilesDocumentSchema = z.strictObject({
  version: z.literal(DOCUMENT_VERSION),
  testRunOutput: z.string().nullable(),
  files: z.array(
    z.strictObject({
      path: z.string(),
      reason: z.enum(UNMEASURED_REASONS),
      toolMessage: z.string().nullable(),
    }),
  ),
});

/**
 * The `uncovered` column of a file. The table has columns for lines and
 * branches only, so the counters of statements and functions travel here
 * until a migration gives them columns of their own.
 */
export const uncoveredDocumentSchema = z.strictObject({
  version: z.literal(DOCUMENT_VERSION),
  statements: counterSchema,
  functions: counterSchema,
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
  uncovered: z.string(),
});

const versionedSchema = z.looseObject({ version: z.unknown() });

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
  if (version !== DOCUMENT_VERSION) {
    throw new UnknownDocumentVersionError(
      `The ${column} document has the version ${String(version)}, and this ` +
        `service reads the version ${String(DOCUMENT_VERSION)}.`,
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
