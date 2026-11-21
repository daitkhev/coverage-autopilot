import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';

/** The id of a job: a text UUID from the id generator. */
export type JobId = string;

/** A scan of a repository, or the whole run of one improvement. */
export type JobKind = 'scan' | 'improvement';

/** The same words as the `CHECK` on the status of the jobs table. */
type JobStatus = 'pending' | 'leased' | 'completed' | 'dead' | 'cancelled';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * A JSON document the queue stores for a handler, such as a payload or an
 * outcome. It carries the version of its schema, so a handler of a newer
 * service can still read what an older one left in the queue.
 */
export interface JobDocument {
  readonly version: number;
  readonly [field: string]: JsonValue;
}

export interface EnqueueJobRequest {
  readonly kind: JobKind;
  /** The repository the job holds while it runs. One job runs at a time. */
  readonly repositoryId: RepositoryId;
  /** Built from the object and the step, such as `improvement:<id>:run`. */
  readonly idempotencyKey: string;
  /** The id of the object the job works on. The queue never reads it. */
  readonly subjectId: string;
  readonly payload: JobDocument;
}

/**
 * `existing`: a job with the same key, kind, repository and payload was
 * there already. `conflict`: the key is taken by a job that differs in one
 * of them. Both name the job that holds the key.
 */
export interface EnqueueJobResult {
  readonly outcome: 'enqueued' | 'existing' | 'conflict';
  readonly jobId: JobId;
}

export interface JobDto {
  readonly id: JobId;
  readonly kind: JobKind;
  readonly repositoryId: RepositoryId;
  readonly subjectId: string;
  readonly status: JobStatus;
  /** How many times a worker claimed it. */
  readonly runs: number;
  /** What the handler returned, once the job is `completed`. */
  readonly outcome: JobDocument | null;
}

/**
 * `pending` and `running`, then the five statuses a check of the quality
 * gate ends in. A scan uses the same words for its own steps.
 */
type ProgressStepStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'not_applicable'
  | 'error';

interface ProgressStep {
  readonly code: string;
  readonly status: ProgressStepStatus;
  /** For a step that repeats, such as run 2 of 3. */
  readonly done?: number;
  readonly total?: number;
}

/** The full list of steps of the current phase. Each report replaces it. */
export interface JobProgress {
  readonly steps: readonly ProgressStep[];
}

export interface JobProgressDto extends JobProgress {
  readonly jobId: JobId;
  /** The client shows the age of an old value, so a stalled job shows. */
  readonly updatedAt: Instant;
}

/**
 * The queue of background work, in the same database as the aggregates.
 * The queue knows nothing about scans and improvements: a handler of the
 * kind of a job does the work.
 */
export interface JobQueue {
  /** In the caller's transaction, so an object and its job are saved together. */
  enqueue(
    request: EnqueueJobRequest,
    transaction: Transaction,
  ): Promise<EnqueueJobResult>;
  cancel(jobId: JobId, transaction: Transaction): Promise<void>;
  getJob(jobId: JobId): Promise<JobDto | null>;
  /** The progress of the leased job of an object. A finished job has none. */
  getProgress(subjectId: string): Promise<JobProgressDto | null>;
}

/** The injection token of the job queue. */
export const JOB_QUEUE = Symbol('JobQueue');
