import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';

import {
  type JobFields,
  jobFieldsOf,
} from '#infrastructure/database/sqlite-job-table';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import type { Transaction } from '#kernel/transaction/transaction';

/** What a worker asks for when it claims a job. Lists are JSON arrays. */
export interface ClaimRequest {
  readonly now: string;
  readonly leaseExpiresAt: string;
  readonly maxRuns: number;
  /** The kinds the worker has a handler for. */
  readonly kinds: string;
  /** The repositories the worker still runs a job of, leased or not. */
  readonly busy: string;
}

/** A job a claim took, with its payload as JSON text. */
export interface ClaimedRow extends JobFields {
  readonly leaseToken: number;
}

/** A job as a worker holds it: its id and the token of its claim. */
export interface HeldLease {
  readonly id: string;
  readonly leaseToken: number;
}

/** The status of a job and the token of its last claim. */
export interface StoredLease {
  readonly status: string;
  readonly leaseToken: number;
}

const CLAIMABLE = `kind IN (SELECT value FROM json_each(:kinds))
  AND serialization_key NOT IN (SELECT value FROM json_each(:busy))`;

const EXPIRED = `status = 'leased' AND lease_expires_at <= :now`;

/** Every claim gives a new token and empties the progress. */
const NEW_LEASE = `lease_token = lease_token + 1,
  lease_expires_at = :leaseExpiresAt,
  progress = NULL,
  progress_updated_at = NULL,
  updated_at = :now`;

const CLAIMED =
  'id, kind, serialization_key, subject_id, payload, runs, lease_token';

/** A job whose lease ran out and whose runs are spent. No run is counted. */
const TAKE_SPENT = `
UPDATE jobs SET ${NEW_LEASE}
WHERE id = (
  SELECT id FROM jobs
  WHERE ${EXPIRED} AND runs >= :maxRuns AND ${CLAIMABLE}
  ORDER BY lease_expires_at, id
  LIMIT 1
)
RETURNING ${CLAIMED}`;

/**
 * A job whose lease ran out comes first, because it still holds its
 * repository. Then the oldest pending job of a repository with no leased
 * job, unless it was told to wait for a moment that has not come. The
 * order is set here: SQLite does not order what `RETURNING` gives.
 */
const CLAIM = `
UPDATE jobs SET status = 'leased', runs = runs + 1, ${NEW_LEASE}
WHERE id = (
  SELECT id FROM (
    SELECT id, 0 AS rank, lease_expires_at AS since
    FROM jobs
    WHERE ${EXPIRED} AND runs < :maxRuns AND ${CLAIMABLE}
    UNION ALL
    SELECT id, 1, created_at
    FROM jobs AS waiting
    WHERE status = 'pending' AND ${CLAIMABLE}
      AND (not_before IS NULL OR not_before <= :now)
      AND NOT EXISTS (
        SELECT 1 FROM jobs AS running
        WHERE running.status = 'leased'
          AND running.serialization_key = waiting.serialization_key
      )
  )
  ORDER BY rank, since, id
  LIMIT 1
)
RETURNING ${CLAIMED}`;

const HELD = `id = :id AND status = 'leased' AND lease_token = :leaseToken`;

const EXTEND = `UPDATE jobs
SET lease_expires_at = :leaseExpiresAt, updated_at = :now
WHERE ${HELD}`;

const SAVE_PROGRESS = `UPDATE jobs
SET progress = :progress, progress_updated_at = :now
WHERE ${HELD}`;

const COMPLETE = `UPDATE jobs
SET status = 'completed', outcome = :outcome, lease_expires_at = NULL,
  updated_at = :now
WHERE ${HELD}`;

/** The run stays counted. */
const RETRY = `UPDATE jobs
SET status = 'pending', lease_expires_at = NULL, updated_at = :now
WHERE ${HELD}`;

/** The run is given back, because the job did not fail. */
const RELEASE = `UPDATE jobs
SET status = 'pending', runs = runs - 1, lease_expires_at = NULL,
  updated_at = :now
WHERE ${HELD}`;

const BURY = `UPDATE jobs
SET status = 'dead', lease_expires_at = NULL, updated_at = :now
WHERE ${HELD}`;

function claimedRowOf(
  record: Readonly<Record<string, SQLOutputValue>> | undefined,
): ClaimedRow | undefined {
  return record === undefined
    ? undefined
    : { ...jobFieldsOf(record), leaseToken: Number(record['lease_token']) };
}

function claimWith(
  transaction: Transaction,
  statement: string,
  request: ClaimRequest,
): ClaimedRow | undefined {
  const record = SqliteTransaction.connectionOf(transaction)
    .prepare(statement)
    .get({ ...request });
  return claimedRowOf(record);
}

function changeHeld(
  transaction: Transaction,
  statement: string,
  values: Readonly<Record<string, SQLInputValue>>,
): void {
  SqliteTransaction.connectionOf(transaction).prepare(statement).run(values);
}

/** Leases a job whose runs are spent, so one worker buries it. */
export function takeSpentJob(
  transaction: Transaction,
  request: ClaimRequest,
): ClaimedRow | undefined {
  return claimWith(transaction, TAKE_SPENT, request);
}

/** Leases the next job to run, and counts the run. */
export function claimJob(
  transaction: Transaction,
  request: ClaimRequest,
): ClaimedRow | undefined {
  return claimWith(transaction, CLAIM, request);
}

export function storedLeaseOf(
  transaction: Transaction,
  jobId: string,
): StoredLease | undefined {
  const record = SqliteTransaction.connectionOf(transaction)
    .prepare('SELECT status, lease_token FROM jobs WHERE id = ?')
    .get(jobId);
  return record === undefined
    ? undefined
    : {
        status: String(record['status']),
        leaseToken: Number(record['lease_token']),
      };
}

export function extendLease(
  transaction: Transaction,
  lease: HeldLease,
  change: { readonly leaseExpiresAt: string; readonly now: string },
): void {
  changeHeld(transaction, EXTEND, { ...lease, ...change });
}

export function saveProgress(
  transaction: Transaction,
  lease: HeldLease,
  change: { readonly progress: string; readonly now: string },
): void {
  changeHeld(transaction, SAVE_PROGRESS, { ...lease, ...change });
}

export function completeJob(
  transaction: Transaction,
  lease: HeldLease,
  change: { readonly outcome: string; readonly now: string },
): void {
  changeHeld(transaction, COMPLETE, { ...lease, ...change });
}

export function retryJob(
  transaction: Transaction,
  lease: HeldLease,
  now: string,
): void {
  changeHeld(transaction, RETRY, { ...lease, now });
}

export function releaseJob(
  transaction: Transaction,
  lease: HeldLease,
  now: string,
): void {
  changeHeld(transaction, RELEASE, { ...lease, now });
}

export function buryJob(
  transaction: Transaction,
  lease: HeldLease,
  now: string,
): void {
  changeHeld(transaction, BURY, { ...lease, now });
}
