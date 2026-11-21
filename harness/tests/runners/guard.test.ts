import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT } from '#harness/shared/policy';

const HARNESS = 'harness';
const MANIFEST = 'package.json';

/** The folders of the harness the check has no use for. */
const LEFT_OUT = ['fixtures', 'tests'].map((name) =>
  join(REPOSITORY_ROOT, HARNESS, name),
);

/**
 * The check of frozen files runs where nothing was installed: the workflow
 * takes the default branch and starts Node on it. So it runs here in a copy
 * of the harness that has no package beside it.
 */
describe('the checks that run with no package installed', () => {
  let copy = '';

  /** Starts the check on a change of these files. */
  function guard(names: readonly string[]): ReturnType<typeof spawnSync> {
    const list = join(copy, 'files.jsonl');
    writeFileSync(
      list,
      names.map((filename) => `${JSON.stringify({ filename })}\n`).join(''),
    );
    return spawnSync(
      process.execPath,
      [join(HARNESS, 'bin/guard.ts'), list, String(names.length)],
      { cwd: copy, encoding: 'utf8' },
    );
  }

  beforeAll(() => {
    copy = mkdtempSync(join(tmpdir(), 'harness-guard-'));
    cpSync(join(REPOSITORY_ROOT, HARNESS), join(copy, HARNESS), {
      recursive: true,
      filter: (source) => !LEFT_OUT.includes(source),
    });
    cpSync(join(REPOSITORY_ROOT, MANIFEST), join(copy, MANIFEST));
  });

  afterAll(() => {
    rmSync(copy, { recursive: true });
  });

  it('should pass a change of the code', () => {
    const run = guard(['backend/src/main.ts', 'package-lock.json']);

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(
      'guard: passed, 0 file(s) of the policy and 1 other file(s)\n',
    );
    expect(run.status).toBe(0);
  });

  it('should hold the name of a branch as well', () => {
    const run = spawnSync(
      process.execPath,
      [join(HARNESS, 'bin/branch-name.ts'), 'feat/add-the-queue'],
      { cwd: copy, encoding: 'utf8' },
    );

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe('branch-name: passed, feat/add-the-queue\n');
    expect(run.status).toBe(0);
  });

  it('should refuse the policy with the code', () => {
    const run = guard(['harness/policy/limits.json', 'backend/src/main.ts']);

    expect(run.stderr).toBe('');
    expect(run.stdout).toContain('policy: harness/policy/limits.json\n');
    expect(run.status).toBe(1);
  });
});
