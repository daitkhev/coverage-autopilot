import { z } from 'zod';

import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import type {
  JobDocument,
  JobDto,
  JobKind,
  JobProgress,
} from '#ports/job-queue.port';

/** The version of the progress document this service writes and reads. */
const PROGRESS_VERSION = 1;

const kindSchema = z.enum(['scan', 'improvement']);

const statusSchema = z.enum([
  'pending',
  'leased',
  'completed',
  'dead',
  'cancelled',
]);

const stepSchema = z.object({
  code: z.string(),
  status: z.enum([
    'pending',
    'running',
    'passed',
    'failed',
    'skipped',
    'not_applicable',
    'error',
  ]),
  done: z.int().exactOptional(),
  total: z.int().exactOptional(),
});

const progressSchema = z.object({
  version: z.literal(PROGRESS_VERSION),
  steps: z.array(stepSchema),
});

const documentSchema = z.looseObject({ version: z.number() });

/** What `JSON.parse` gives is JSON, so only the version is left to check. */
function isDocument(value: unknown): value is JobDocument {
  return documentSchema.safeParse(value).success;
}

/**
 * A payload or an outcome as the queue stored it. The queue checks only
 * that it is a document with a version: what the version means is the
 * concern of the handler.
 */
export function jobDocumentOf(text: string): JobDocument {
  const value: unknown = JSON.parse(text);
  if (isDocument(value)) {
    return value;
  }
  throw new InvalidStoredJobError(
    'A stored job document is not an object with a number as its version.',
  );
}

export function jobProgressOf(text: string): JobProgress {
  const parsed = progressSchema.safeParse(JSON.parse(text));
  if (parsed.success) {
    return { steps: parsed.data.steps };
  }
  throw new InvalidStoredJobError(
    `The stored progress of a job is not a list of steps of version ` +
      `${String(PROGRESS_VERSION)}.`,
  );
}

/** Progress is a stored document, so it carries its version too. */
export function progressDocumentOf(progress: JobProgress): string {
  return JSON.stringify({ version: PROGRESS_VERSION, steps: progress.steps });
}

export function jobKindOf(text: string): JobKind {
  const parsed = kindSchema.safeParse(text);
  if (parsed.success) {
    return parsed.data;
  }
  throw new InvalidStoredJobError(`"${text}" is not a kind of job.`);
}

export function jobStatusOf(text: string): JobDto['status'] {
  const parsed = statusSchema.safeParse(text);
  if (parsed.success) {
    return parsed.data;
  }
  throw new InvalidStoredJobError(`"${text}" is not a status of a job.`);
}
