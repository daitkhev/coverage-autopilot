import { DatabaseSync } from 'node:sqlite';

/** A job as the database keeps it. */
export interface StoredJob {
  readonly id: string;
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly subjectId: string;
  readonly status: string;
  readonly runs: number;
  readonly leaseExpiresAt: string | null;
  /** The document the job ended with, as JSON text. */
  readonly outcome: string | null;
}

/** A snapshot, with the number of its rows of files. */
interface StoredSnapshot {
  readonly id: string;
  readonly originKey: string;
  readonly files: number;
}

export interface StoredImprovement {
  readonly id: string;
  readonly repositoryId: string;
  readonly targetFile: string;
  readonly status: string;
  readonly failureReason: string | null;
  readonly baseCommit: string;
  readonly branch: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestUrl: string | null;
  readonly createdAt: string;
  /** When its status last changed: for a final one, when it ended. */
  readonly phaseStartedAt: string;
}

/** The work a stopped service left in its database. */
export interface StoredWork {
  readonly jobs: readonly StoredJob[];
  readonly snapshots: readonly StoredSnapshot[];
  readonly improvements: readonly StoredImprovement[];
}

const JOBS = `SELECT id, kind, idempotency_key AS idempotencyKey,
    subject_id AS subjectId, status, runs,
    lease_expires_at AS leaseExpiresAt, outcome
  FROM jobs ORDER BY id`;

const SNAPSHOTS = `SELECT id, origin_key AS originKey,
    (SELECT COUNT(*) FROM file_coverages
      WHERE snapshot_id = coverage_snapshots.id) AS files
  FROM coverage_snapshots ORDER BY id`;

const IMPROVEMENTS = `SELECT id, repository_id AS repositoryId,
    target_file AS targetFile, status, failure_reason AS failureReason,
    base_commit AS baseCommit, branch,
    pull_request_number AS pullRequestNumber,
    pull_request_url AS pullRequestUrl, created_at AS createdAt,
    phase_started_at AS phaseStartedAt
  FROM improvements ORDER BY created_at, id`;

/**
 * Reads the work in the database of an instance whose service has
 * stopped. It opens the file for reading only, so the reading changes
 * nothing a check looks at. Whether the file is sound is what
 * `databaseStateOf` of `instance-state` tells.
 */
export function storedWorkOf(path: string): StoredWork {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const all = <Row>(sql: string): Row[] =>
      database.prepare(sql).all() as unknown as Row[];
    return {
      jobs: all<StoredJob>(JOBS),
      snapshots: all<StoredSnapshot>(SNAPSHOTS),
      improvements: all<StoredImprovement>(IMPROVEMENTS),
    };
  } finally {
    database.close();
  }
}

/** The job of the key, when the database holds one. */
export function jobKeyed(
  stored: StoredWork,
  key: string,
): StoredJob | undefined {
  return stored.jobs.find((job) => job.idempotencyKey === key);
}

/** The document a job ended with, or an empty one. */
export function outcomeOf(
  job: StoredJob | undefined,
): Readonly<Record<string, unknown>> {
  return job === undefined || job.outcome === null
    ? {}
    : (JSON.parse(job.outcome) as Record<string, unknown>);
}
