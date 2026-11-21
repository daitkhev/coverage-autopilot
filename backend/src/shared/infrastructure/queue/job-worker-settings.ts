/** How the worker runs jobs. The service passes one value of them. */
export interface JobWorkerSettings {
  /** How long a claim or a heartbeat holds a job. */
  readonly leaseMs: number;
  /** How often a running job extends its lease. Well under the lease. */
  readonly heartbeatMs: number;
  /** The greatest number of runs of one job, the first one included. */
  readonly maxRuns: number;
  /** How often the worker looks for a job while it has a free place. */
  readonly pollMs: number;
  /** How many jobs run at once. Never two of one repository. */
  readonly jobsAtOnce: number;
}

/** The injection token of the settings of the worker. */
export const JOB_WORKER_SETTINGS = Symbol('JobWorkerSettings');

const LEASE_MS = 30_000;

/** Two heartbeats can fail before the lease runs out. */
const HEARTBEAT_MS = 10_000;

/** Retries are limited, and a retry repeats the same step. */
const MAX_RUNS = 3;

const POLL_MS = 1_000;

/** A run of mutation tests takes the processor of the machine. */
const JOBS_AT_ONCE = 2;

export const DEFAULT_JOB_WORKER_SETTINGS: JobWorkerSettings = {
  leaseMs: LEASE_MS,
  heartbeatMs: HEARTBEAT_MS,
  maxRuns: MAX_RUNS,
  pollMs: POLL_MS,
  jobsAtOnce: JOBS_AT_ONCE,
};
