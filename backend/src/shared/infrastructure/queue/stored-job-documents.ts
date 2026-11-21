import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import type {
  JobDocument,
  JobDto,
  JobKind,
  JobProgress,
} from '#ports/job-queue.port';

type ProgressStep = JobProgress['steps'][number];

/** The version of the progress document this service writes and reads. */
const PROGRESS_VERSION = 1;

const KINDS: readonly JobKind[] = ['scan', 'improvement'];

const STATUSES: readonly JobDto['status'][] = [
  'pending',
  'leased',
  'completed',
  'dead',
  'cancelled',
];

const STEP_STATUSES: readonly ProgressStep['status'][] = [
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
  'not_applicable',
  'error',
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): boolean {
  return value === undefined || Number.isInteger(value);
}

function isStep(value: unknown): value is ProgressStep {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    STEP_STATUSES.some((status) => status === value['status']) &&
    isCount(value['done']) &&
    isCount(value['total'])
  );
}

function isSteps(value: unknown): value is readonly ProgressStep[] {
  return Array.isArray(value) && value.every(isStep);
}

/** What `JSON.parse` gives is JSON, so only the version is left to check. */
function isDocument(value: unknown): value is JobDocument {
  return isRecord(value) && typeof value['version'] === 'number';
}

function oneOf<T extends string>(
  values: readonly T[],
  text: string,
  what: string,
): T {
  const value = values.find((candidate) => candidate === text);
  if (value === undefined) {
    throw new InvalidStoredJobError(`"${text}" is not ${what}.`);
  }
  return value;
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
  const value: unknown = JSON.parse(text);
  if (
    isRecord(value) &&
    value['version'] === PROGRESS_VERSION &&
    isSteps(value['steps'])
  ) {
    return { steps: value['steps'] };
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
  return oneOf(KINDS, text, 'a kind of job');
}

export function jobStatusOf(text: string): JobDto['status'] {
  return oneOf(STATUSES, text, 'a status of a job');
}
