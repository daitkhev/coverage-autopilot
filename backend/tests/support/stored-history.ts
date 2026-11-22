import { DatabaseSync } from 'node:sqlite';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { databaseStateOf } from '#tests/support/instance-state';

/** What `PRAGMA integrity_check` answers, alone, for a sound file. */
const SOUND = 'ok';

const FINAL = `('completed', 'skipped', 'failed', 'cancelled')`;

/**
 * Two runs of one repository whose stored times overlap. A run that was
 * claimed again keeps the moment of its first claim, so only jobs that
 * ran once are compared: their start and their last change are when they
 * were claimed and when they ended or were cancelled.
 */
const OVERLAPPING_RUNS = `
SELECT later.id AS job, earlier.id AS overlapped, later.serialization_key AS repository
FROM jobs AS later JOIN jobs AS earlier
  ON later.serialization_key = earlier.serialization_key AND later.id <> earlier.id
WHERE later.runs = 1 AND earlier.runs = 1
  AND later.started_at IS NOT NULL AND earlier.started_at IS NOT NULL
  AND later.started_at >= earlier.started_at
  AND later.started_at < earlier.updated_at`;

/** What the end of a run must not find in the database, each in words. */
const NOTHING_OF: readonly { readonly what: string; readonly query: string }[] =
  [
    {
      what: 'A job did not end',
      query: `SELECT id, kind, status, runs FROM jobs WHERE status NOT IN ('completed', 'cancelled')`,
    },
    { what: 'Two jobs of one repository ran at once', query: OVERLAPPING_RUNS },
    {
      what: 'A repository was connected twice',
      query: `SELECT lower(owner) || '/' || lower(name) AS repository, count(*) AS rows
      FROM repositories GROUP BY 1 HAVING count(*) > 1`,
    },
    {
      what: 'An improvement is not final',
      query: `SELECT id, status FROM improvements WHERE status NOT IN ${FINAL}`,
    },
    {
      what: 'A final improvement kept an open attempt',
      query: `SELECT improvement_id, number FROM attempts WHERE finished_at IS NULL`,
    },
    {
      what: 'A completed scan has no snapshot of its own',
      query: `SELECT id FROM jobs AS scan WHERE kind = 'scan' AND status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM coverage_snapshots AS snapshot
        WHERE snapshot.origin_key = 'scan:' || scan.id
          AND snapshot.id = json_extract(scan.outcome, '$.snapshotId'))`,
    },
    {
      what: 'A snapshot has no scan or improvement that asked for it',
      query: `SELECT id, origin_key FROM coverage_snapshots AS snapshot
      WHERE NOT EXISTS (SELECT 1 FROM jobs AS scan WHERE scan.kind = 'scan'
          AND snapshot.origin_key = 'scan:' || scan.id)
        AND NOT EXISTS (SELECT 1 FROM improvements AS improvement
          WHERE snapshot.origin_key = 'improvement:' || improvement.id || ':baseline')`,
    },
  ];

function soundness(paths: InstancePaths, database: DatabaseSync): string[] {
  const { integrity } = databaseStateOf(paths);
  const references = database
    .prepare('PRAGMA foreign_key_check')
    .all()
    .map((row) => `A row breaks a foreign key: ${JSON.stringify(row)}.`);
  return [
    ...(integrity.join() === SOUND
      ? []
      : [`The file is damaged: ${integrity.join('; ')}.`]),
    ...references,
  ];
}

/**
 * Reads the database of a service that stopped, and gives what breaks a
 * rule of the stored history: a damaged file or a broken reference, a job
 * left behind, two runs of one repository at once, a repository twice, an
 * improvement or an attempt left open, and a snapshot without its origin.
 */
export function storedFindings(paths: InstancePaths): string[] {
  const database = new DatabaseSync(paths.database, { readOnly: true });
  try {
    return [
      ...soundness(paths, database),
      ...NOTHING_OF.flatMap(({ what, query }) =>
        database
          .prepare(query)
          .all()
          .map((row) => `${what}: ${JSON.stringify(row)}.`),
      ),
    ];
  } finally {
    database.close();
  }
}
