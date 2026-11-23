-- An improvement can wait for a window of a subscription to open again,
-- and can run with no limit of tokens.
--
-- SQLite cannot change the CHECK of a column, so the table is built again
-- and the rows are copied. The attempts keep referring to it by its name.

CREATE TABLE improvements_next (
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
      'waiting_for_limit',
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
  -- Empty under a subscription, where its own windows hold the generator.
  max_tokens INTEGER,
  time_limit_ms INTEGER NOT NULL,
  tokens_used INTEGER NOT NULL,
  -- The time limit as an absolute time, set when work starts, so a
  -- restart cannot reset it. A wait moves it later by its own length.
  deadline_at TEXT,
  -- When the window opens. Set while the improvement waits and only then.
  resumes_at TEXT,
  -- A wait spends no attempt, so it is counted apart and has its own cap.
  limit_waits INTEGER NOT NULL,
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
    REFERENCES file_coverages (snapshot_id, file_path),
  CHECK ((status = 'waiting_for_limit') = (resumes_at IS NOT NULL))
) STRICT;

INSERT INTO improvements_next (
  id, repository_id, source_snapshot_id, baseline_snapshot_id, base_commit,
  target_file, status, failure_reason, request_key, request_fingerprint,
  quality_policy, generator_config, max_attempts, max_tokens, time_limit_ms,
  tokens_used, deadline_at, resumes_at, limit_waits, mutation_baseline,
  branch, pull_request_number, pull_request_url, phase_started_at, version,
  created_at, updated_at
)
SELECT
  id, repository_id, source_snapshot_id, baseline_snapshot_id, base_commit,
  target_file, status, failure_reason, request_key, request_fingerprint,
  quality_policy, generator_config, max_attempts, max_tokens, time_limit_ms,
  tokens_used, deadline_at, NULL, 0, mutation_baseline,
  branch, pull_request_number, pull_request_url, phase_started_at, version,
  created_at, updated_at
FROM improvements;

DROP TABLE improvements;

ALTER TABLE improvements_next RENAME TO improvements;

-- One open improvement per repository and file. One that waits is open.
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
