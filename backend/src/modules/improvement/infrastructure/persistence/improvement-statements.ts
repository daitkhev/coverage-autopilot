const IMPROVEMENT_COLUMNS = [
  'id',
  'repository_id',
  'source_snapshot_id',
  'baseline_snapshot_id',
  'base_commit',
  'target_file',
  'status',
  'mode',
  'failure_reason',
  'failure_message',
  'skip_reason',
  'skip_message',
  'request_key',
  'request_fingerprint',
  'quality_policy',
  'generator_config',
  'max_attempts',
  'max_tokens',
  'time_limit_ms',
  'tokens_used',
  'deadline_at',
  'resumes_at',
  'limit_waits',
  'verification_baseline',
  'branch',
  'pull_request_number',
  'pull_request_url',
  'phase_started_at',
  'version',
  'created_at',
  'updated_at',
];

/** What names an attempt: its improvement and its number. */
const ATTEMPT_KEY = ['improvement_id', 'number'];

const ATTEMPT_FIELDS = [
  'generation_outcome',
  'tokens_used',
  'patch',
  'patch_hash',
  'verification_report',
  'generation_output',
  'started_at',
  'finished_at',
];

const ATTEMPT_COLUMNS = [...ATTEMPT_KEY, ...ATTEMPT_FIELDS];

function listed(columns: readonly string[], each = (column: string) => column) {
  return columns.map(each).join(', ');
}

export const INSERT_IMPROVEMENT =
  `INSERT INTO improvements (${listed(IMPROVEMENT_COLUMNS)}) ` +
  `VALUES (${listed(IMPROVEMENT_COLUMNS, (column) => `:${column}`)})`;

/**
 * One statement checks the version that was read and writes the next
 * one, so a change made in between is never overwritten.
 */
export const UPDATE_IMPROVEMENT =
  `UPDATE improvements SET ${listed(
    IMPROVEMENT_COLUMNS.filter((column) => column !== 'id'),
    (column) => `${column} = :${column}`,
  )} ` + 'WHERE id = :id AND version = :read_version';

/** A stored attempt changes, but never its improvement or its number. */
export const UPSERT_ATTEMPT =
  `INSERT INTO attempts (${listed(ATTEMPT_COLUMNS)}) ` +
  `VALUES (${listed(ATTEMPT_COLUMNS, (column) => `:${column}`)}) ` +
  `ON CONFLICT (${listed(ATTEMPT_KEY)}) DO UPDATE SET ` +
  listed(ATTEMPT_FIELDS, (column) => `${column} = excluded.${column}`);

export const SELECT_IMPROVEMENTS = `SELECT ${listed(IMPROVEMENT_COLUMNS)} FROM improvements`;

export const SELECT_ATTEMPTS =
  `SELECT number, ${listed(ATTEMPT_FIELDS)} FROM attempts ` +
  'WHERE improvement_id = ? ORDER BY number';

/** As the indexes of the table name them. */
export const IS_ACTIVE = "status NOT IN ('failed', 'cancelled')";

export const IS_OPEN =
  "status NOT IN ('completed', 'skipped', 'failed', 'cancelled')";

/** A filter field that is left out is `NULL`, which matches every row. */
export const LIST_IMPROVEMENTS =
  `${SELECT_IMPROVEMENTS} WHERE ` +
  '(:repository_id IS NULL OR repository_id = :repository_id) AND ' +
  '(:status IS NULL OR status = :status) AND ' +
  '(:target_file IS NULL OR target_file = :target_file) ' +
  'ORDER BY created_at DESC, id DESC';
