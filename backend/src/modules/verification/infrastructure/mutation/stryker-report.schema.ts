import { z } from 'zod';

/** Both a line and a column count from 1. */
const position = z.looseObject({
  line: z.int().positive(),
  column: z.int().positive(),
});

const STATUSES = [
  'Killed',
  'Survived',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Timeout',
  'Ignored',
  'Pending',
] as const;

/**
 * One mutant. The id belongs to the tool and is not read. `replacement`
 * is optional in the schema, and StrykerJS writes it for every mutant.
 */
const mutantSchema = z.looseObject({
  id: z.string(),
  mutatorName: z.string(),
  replacement: z.string(),
  location: z.looseObject({ start: position, end: position }),
  status: z.enum(STATUSES),
  statusReason: z.string().exactOptional(),
  killedBy: z.array(z.string()).exactOptional(),
  coveredBy: z.array(z.string()).exactOptional(),
});

export type StrykerMutant = z.infer<typeof mutantSchema>;

const fileSchema = z.looseObject({
  language: z.string(),
  source: z.string(),
  mutants: z.array(mutantSchema),
});

const testFileSchema = z.looseObject({
  tests: z.array(z.looseObject({ id: z.string(), name: z.string() })),
});

/**
 * The report of mutation-testing-report-schema that the `json` reporter
 * of StrykerJS writes, and the incremental file in the same format. Files
 * and test files are keyed by their paths relative to the working copy.
 * The ids of tests hold only inside one report. Fields that are not read,
 * such as the sources the incremental mode compares, are kept.
 */
export const strykerReportSchema = z.looseObject({
  schemaVersion: z.string(),
  thresholds: z.looseObject({ high: z.int(), low: z.int() }),
  files: z.record(z.string(), fileSchema),
  testFiles: z.record(z.string(), testFileSchema).exactOptional(),
});

export type StrykerReport = z.infer<typeof strykerReportSchema>;
