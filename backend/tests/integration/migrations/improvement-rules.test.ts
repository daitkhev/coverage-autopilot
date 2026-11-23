import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SchemaRows,
  STORED_TIME,
  type Target,
} from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const UNIQUE = 'UNIQUE constraint failed';
const FOREIGN_KEY = 'FOREIGN KEY constraint failed';
const CHECK = 'CHECK constraint failed';
const FINAL = ['completed', 'skipped', 'failed', 'cancelled'];

let database: TemporaryDatabase;
let rows: SchemaRows;
let target: Target;

/** A second measured file of the same snapshot, for a second improvement. */
function otherFile(): Target {
  rows.file(target.snapshotId, 'src/b.ts');
  return { ...target, filePath: 'src/b.ts' };
}

beforeEach(() => {
  database = createMigratedDatabase();
  rows = new SchemaRows(database.connection);
  target = rows.target();
});

afterEach(() => {
  database.remove();
});

describe('improvements', () => {
  describe('one open improvement per repository and file', () => {
    it('should refuse a second open improvement of the same file', () => {
      rows.improvement(target, { status: 'generating' });

      expect(() => rows.improvement(target)).toThrow(UNIQUE);
    });

    it.each(FINAL)('should allow a new one once the last is %s', (status) => {
      rows.improvement(target, { status });

      expect(() => rows.improvement(target)).not.toThrow();
    });
  });

  describe('the request key', () => {
    it('should refuse a key that another improvement has', () => {
      rows.improvement(target, { status: 'failed', request_key: 'k' });

      expect(() => rows.improvement(target, { request_key: 'k' })).toThrow(
        UNIQUE,
      );
    });
  });

  describe('the request fingerprint', () => {
    it.each(['analyzing', 'awaiting_approval', 'completed', 'skipped'])(
      'should refuse the same work while the earlier is %s',
      (status) => {
        rows.improvement(target, { status, request_fingerprint: 'f' });

        expect(() =>
          rows.improvement(otherFile(), { request_fingerprint: 'f' }),
        ).toThrow(UNIQUE);
      },
    );

    it.each(['failed', 'cancelled'])(
      'should allow the same work again after it %s',
      (status) => {
        rows.improvement(target, { status, request_fingerprint: 'f' });

        expect(() =>
          rows.improvement(otherFile(), { request_fingerprint: 'f' }),
        ).not.toThrow();
      },
    );
  });

  describe('the snapshots', () => {
    it('should refuse a source snapshot of another repository', () => {
      const other = rows.target();

      expect(() =>
        rows.improvement({ ...other, repositoryId: target.repositoryId }),
      ).toThrow(FOREIGN_KEY);
    });

    it('should refuse a baseline snapshot of another repository', () => {
      const other = rows.target();

      expect(() =>
        rows.improvement(target, { baseline_snapshot_id: other.snapshotId }),
      ).toThrow(FOREIGN_KEY);
    });

    it('should accept a baseline snapshot of the same repository', () => {
      const baseline = rows.snapshot(target.repositoryId);

      expect(() =>
        rows.improvement(target, { baseline_snapshot_id: baseline }),
      ).not.toThrow();
    });

    it.each(['src/c.ts', 'src/A.ts', './src/a.ts', 'src//a.ts'])(
      'should refuse a target the source snapshot did not measure: %s',
      (filePath) => {
        expect(() => rows.improvement({ ...target, filePath })).toThrow(
          FOREIGN_KEY,
        );
      },
    );
  });

  describe('the status', () => {
    it.each(['Created', 'done', 'awaiting-approval', ''])(
      'should refuse the unknown status "%s"',
      (status) => {
        expect(() => rows.improvement(target, { status })).toThrow(CHECK);
      },
    );
  });

  describe('the wait for a limit', () => {
    const waiting = { status: 'waiting_for_limit', resumes_at: STORED_TIME };

    it('should accept an improvement that waits until a known time', () => {
      expect(() => rows.improvement(target, waiting)).not.toThrow();
    });

    it('should refuse one that waits with no time to go on at', () => {
      expect(() =>
        rows.improvement(target, { status: 'waiting_for_limit' }),
      ).toThrow(CHECK);
    });

    it('should refuse a time to go on at while it does not wait', () => {
      expect(() =>
        rows.improvement(target, {
          status: 'generating',
          resumes_at: STORED_TIME,
        }),
      ).toThrow(CHECK);
    });

    it('should count one that waits as open, so its file is taken', () => {
      rows.improvement(target, waiting);

      expect(() => rows.improvement(target)).toThrow(UNIQUE);
    });
  });

  describe('the limit of tokens', () => {
    it('should accept none, as a subscription has', () => {
      expect(() =>
        rows.improvement(target, { max_tokens: null }),
      ).not.toThrow();
    });
  });

  describe('the stored documents', () => {
    it.each(['quality_policy', 'generator_config', 'verification_baseline'])(
      'should refuse a %s that is not JSON',
      (column) => {
        expect(() => rows.improvement(target, { [column]: '{x' })).toThrow(
          CHECK,
        );
      },
    );

    it('should accept no baseline of the gate before it is measured', () => {
      expect(() =>
        rows.improvement(target, { verification_baseline: null }),
      ).not.toThrow();
    });
  });

  describe('the end of an improvement', () => {
    it.each([
      [
        'a failure with its sentence',
        { failure_reason: 'stale_snapshot', failure_message: 'It changed.' },
      ],
      [
        'a skip with its sentence',
        { skip_reason: 'threshold_met', skip_message: 'Nothing to do.' },
      ],
    ])('should accept %s', (_name, row) => {
      expect(() => rows.improvement(target, row)).not.toThrow();
    });

    it.each([
      ['a failure with no sentence', { failure_reason: 'stale_snapshot' }],
      ['a sentence of no failure', { failure_message: 'The file changed.' }],
      ['a skip with no sentence', { skip_reason: 'threshold_met' }],
      ['a sentence of no skip', { skip_message: 'Nothing to do.' }],
    ])('should refuse %s', (_name, row) => {
      expect(() => rows.improvement(target, row)).toThrow(CHECK);
    });

    it('should refuse an improvement with no mode', () => {
      expect(() => rows.improvement(target, { mode: null })).toThrow(
        'NOT NULL constraint failed: improvements.mode',
      );
    });
  });

  describe('the types of the columns', () => {
    it('should refuse a value of another type', () => {
      expect(() => rows.improvement(target, { version: 'one' })).toThrow(
        'cannot store TEXT value in INTEGER column improvements.version',
      );
    });
  });
});

describe('attempts', () => {
  let improvementId: string;

  beforeEach(() => {
    improvementId = rows.improvement(target);
  });

  it('should refuse a second open attempt of an improvement', () => {
    rows.attempt(improvementId);

    expect(() => {
      rows.attempt(improvementId, { number: 2 });
    }).toThrow(UNIQUE);
  });

  it('should allow the next attempt once the open one is finished', () => {
    rows.attempt(improvementId, { finished_at: STORED_TIME });

    expect(() => {
      rows.attempt(improvementId, { number: 2 });
    }).not.toThrow();
  });

  it.each([
    { patch: 'diff', patch_hash: null },
    { patch: null, patch_hash: 'hash' },
  ])('should refuse a patch without its hash: %o', (row) => {
    expect(() => {
      rows.attempt(improvementId, row);
    }).toThrow(CHECK);
  });

  it('should accept a patch with its hash', () => {
    expect(() => {
      rows.attempt(improvementId, { patch: 'diff', patch_hash: 'hash' });
    }).not.toThrow();
  });

  it('should refuse an attempt of a missing improvement', () => {
    expect(() => {
      rows.attempt('missing');
    }).toThrow(FOREIGN_KEY);
  });

  it.each(['verification_report', 'generation_output'])(
    'should refuse a %s that is not JSON',
    (column) => {
      expect(() => {
        rows.attempt(improvementId, { [column]: 'passed' });
      }).toThrow(CHECK);
    },
  );

  it('should accept no output until a call of the generator ends', () => {
    expect(() => {
      rows.attempt(improvementId, { generation_output: null });
    }).not.toThrow();
  });
});

describe('coverage snapshots', () => {
  it('should refuse a second snapshot of the same origin', () => {
    rows.snapshot(target.repositoryId, { origin_key: 'scan:1' });

    expect(() =>
      rows.snapshot(target.repositoryId, { origin_key: 'scan:1' }),
    ).toThrow(UNIQUE);
  });

  it('should refuse a snapshot of a missing repository', () => {
    expect(() => rows.snapshot('missing')).toThrow(FOREIGN_KEY);
  });

  it.each(['detected_project', 'scan_parameters', 'unmeasured_files'])(
    'should refuse a %s that is not JSON',
    (column) => {
      expect(() =>
        rows.snapshot(target.repositoryId, { [column]: 'none' }),
      ).toThrow(CHECK);
    },
  );
});

describe('repositories', () => {
  it('should refuse a second repository of the same owner and name', () => {
    rows.repository({ owner: 'o', name: 'n' });

    expect(() => rows.repository({ owner: 'o', name: 'n' })).toThrow(UNIQUE);
  });
});
