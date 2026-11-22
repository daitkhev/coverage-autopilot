import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import type { JobDocument, JobDto } from '#ports/job-queue.port';
import { REPOSITORY_ID } from '#tests/support/coverage-snapshots';

/** The id of the scan of the tests, which is the id of its job. */
export const SCAN_ID = '00000000-0000-4000-8000-0000000000dd';

export const QUEUED_AT = '2026-03-04T05:00:00.000Z';

export const STARTED_AT = '2026-03-04T05:01:00.000Z';

export const ENDED_AT = '2026-03-04T05:09:00.000Z';

/** The scan job of `acme/widgets` as the queue holds it before a claim. */
export function queuedScanJob(): JobDto {
  return {
    id: SCAN_ID,
    kind: 'scan',
    repositoryId: RepositoryId.create(REPOSITORY_ID),
    subjectId: REPOSITORY_ID,
    status: 'pending',
    runs: 0,
    outcome: null,
    createdAt: Instant.parse(QUEUED_AT),
    startedAt: null,
    endedAt: null,
  };
}

/** The scan job while a worker runs it. */
export function runningScanJob(): JobDto {
  return {
    ...queuedScanJob(),
    status: 'leased',
    runs: 1,
    startedAt: Instant.parse(STARTED_AT),
  };
}

/** The scan job once it ended, with what its handler returned. */
export function endedScanJob(
  status: 'completed' | 'dead' | 'cancelled',
  outcome: JobDocument | null = null,
): JobDto {
  return {
    ...runningScanJob(),
    status,
    outcome,
    endedAt: Instant.parse(ENDED_AT),
  };
}
