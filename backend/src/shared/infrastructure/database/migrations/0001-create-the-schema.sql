-- The schema of the first version: three aggregates in five tables, and
-- the queue in one.
--
-- A column that an index or a check reads is NOT NULL: SQLite sees no
-- conflict between two NULL values, and a check that gives NULL passes.
-- A TEXT primary key is NOT NULL too, because SQLite lets it be NULL.
--
-- An index over open rows names the final statuses, so a status added
-- later counts as open until someone decides otherwise.
--
-- Time is text in UTC as YYYY-MM-DDTHH:mm:ss.sssZ, from the Clock of the
-- service. A stored document is JSON that carries its schema version.

CREATE TABLE repositories (
  id TEXT NOT NULL PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  connected_at TEXT NOT NULL
) STRICT;

-- Connecting a repository again finds the one already connected.
CREATE UNIQUE INDEX repositories_owner_name ON repositories (owner, name);

CREATE TABLE coverage_snapshots (
  id TEXT NOT NULL PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories (id),
  commit_sha TEXT NOT NULL,
  -- The scan job or the improvement that asked for the snapshot.
  origin_key TEXT NOT NULL,
  detected_project TEXT NOT NULL CHECK (json_valid(detected_project)),
  scan_parameters TEXT NOT NULL CHECK (json_valid(scan_parameters)),
  unmeasured_files TEXT NOT NULL CHECK (json_valid(unmeasured_files)),
  -- Totals over the measured files only.
  lines_covered INTEGER NOT NULL,
  lines_total INTEGER NOT NULL,
  branches_covered INTEGER NOT NULL,
  branches_total INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  -- The target of the foreign keys that tie an improvement's snapshots
  -- to its repository.
  UNIQUE (id, repository_id)
) STRICT;

-- One snapshot per origin, so a late duplicate of a scan changes nothing.
CREATE UNIQUE INDEX coverage_snapshots_origin_key
  ON coverage_snapshots (origin_key);

-- The snapshots of a repository, newest first.
CREATE INDEX coverage_snapshots_repository_time
  ON coverage_snapshots (repository_id, captured_at);

-- A measured file, or a file with type declarations only, whose counters
-- are all zero. An unmeasured file has no row, so it is never a target.
CREATE TABLE file_coverages (
  snapshot_id TEXT NOT NULL REFERENCES coverage_snapshots (id),
  file_path TEXT NOT NULL,
  state TEXT NOT NULL,
  lines_covered INTEGER NOT NULL,
  lines_total INTEGER NOT NULL,
  branches_covered INTEGER NOT NULL,
  branches_total INTEGER NOT NULL,
  -- The uncovered lines and branches.
  uncovered TEXT NOT NULL CHECK (json_valid(uncovered)),
  PRIMARY KEY (snapshot_id, file_path)
) STRICT;

CREATE TABLE improvements (
  id TEXT NOT NULL PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories (id),
  source_snapshot_id TEXT NOT NULL,
  -- Captured in `analyzing`, so empty before.
  baseline_snapshot_id TEXT,
  base_commit TEXT NOT NULL,
  target_file TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'created',
      'analyzing',
      'generating',
      'verifying',
      'awaiting_approval',
      'publishing',
      'completed',
      'skipped',
      'failed',
      'cancelled'
    )
  ),
  failure_reason TEXT,
  request_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  quality_policy TEXT NOT NULL CHECK (json_valid(quality_policy)),
  generator_config TEXT NOT NULL CHECK (json_valid(generator_config)),
  max_attempts INTEGER NOT NULL,
  max_tokens INTEGER NOT NULL,
  time_limit_ms INTEGER NOT NULL,
  tokens_used INTEGER NOT NULL,
  -- The time limit as an absolute time, set when work starts, so a
  -- restart cannot reset it.
  deadline_at TEXT,
  mutation_baseline TEXT CHECK (
    mutation_baseline IS NULL OR json_valid(mutation_baseline)
  ),
  branch TEXT,
  pull_request_number INTEGER,
  pull_request_url TEXT,
  -- The screen shows the time since the current phase began.
  phase_started_at TEXT NOT NULL,
  -- Checked on every write: a cancel or an approval can arrive while a
  -- worker is busy.
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_snapshot_id, repository_id)
    REFERENCES coverage_snapshots (id, repository_id),
  FOREIGN KEY (baseline_snapshot_id, repository_id)
    REFERENCES coverage_snapshots (id, repository_id),
  -- The target is a file of the source snapshot.
  FOREIGN KEY (source_snapshot_id, target_file)
    REFERENCES file_coverages (snapshot_id, file_path)
) STRICT;

-- One open improvement per repository and file.
CREATE UNIQUE INDEX improvements_open_target
  ON improvements (repository_id, target_file)
  WHERE status NOT IN ('completed', 'skipped', 'failed', 'cancelled');

-- The same request key gives the same improvement.
CREATE UNIQUE INDEX improvements_request_key
  ON improvements (request_key);

-- The same work is not done twice, unless the earlier try failed or was
-- cancelled.
CREATE UNIQUE INDEX improvements_active_fingerprint
  ON improvements (request_fingerprint)
  WHERE status NOT IN ('failed', 'cancelled');

CREATE TABLE attempts (
  improvement_id TEXT NOT NULL REFERENCES improvements (id),
  number INTEGER NOT NULL,
  generation_outcome TEXT,
  tokens_used INTEGER,
  -- Saved once, with its hash, in the move to `verifying`.
  patch TEXT,
  patch_hash TEXT,
  verification_report TEXT CHECK (
    verification_report IS NULL OR json_valid(verification_report)
  ),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  PRIMARY KEY (improvement_id, number),
  CHECK ((patch IS NULL) = (patch_hash IS NULL))
) STRICT;

-- One open attempt per improvement.
CREATE UNIQUE INDEX attempts_open
  ON attempts (improvement_id)
  WHERE finished_at IS NULL;

-- A job has no foreign key: the id of its object is plain text to the
-- queue, and the handler checks that the object exists.
CREATE TABLE jobs (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL,
  -- The repository the job holds while it runs.
  serialization_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'leased', 'completed', 'dead', 'cancelled')
  ),
  runs INTEGER NOT NULL,
  -- Grows with every claim. A save checks it, so a worker that lost its
  -- lease saves nothing.
  lease_token INTEGER NOT NULL,
  lease_expires_at TEXT,
  -- Empty until a handler reports something.
  progress TEXT CHECK (progress IS NULL OR json_valid(progress)),
  progress_updated_at TEXT,
  outcome TEXT CHECK (outcome IS NULL OR json_valid(outcome)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- The claim reads the end of a lease through an index.
  CHECK (status <> 'leased' OR lease_expires_at IS NOT NULL)
) STRICT;

-- One running job per repository.
CREATE UNIQUE INDEX jobs_leased_serialization_key
  ON jobs (serialization_key)
  WHERE status = 'leased';

-- One job per idempotency key.
CREATE UNIQUE INDEX jobs_idempotency_key
  ON jobs (idempotency_key);

-- The claim takes the oldest pending job.
CREATE INDEX jobs_pending_by_time
  ON jobs (created_at, id)
  WHERE status = 'pending';

-- The claim takes a job whose lease ran out first.
CREATE INDEX jobs_leased_by_expiry
  ON jobs (lease_expires_at)
  WHERE status = 'leased';
