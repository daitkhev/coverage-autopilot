import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT } from '#harness/shared/policy';

const PROTECTED =
  'push refused: A push to main is denied. ' +
  'It takes changes through a pull request.';

/**
 * Real git runs the real hook here. The test is with the runners and not
 * with the other tests on purpose: the hook can start the full gate, and
 * the full gate must never start this test.
 */
describe('the hook git runs before a push', () => {
  it('should refuse a real push to the protected branch', () => {
    const remote = mkdtempSync(join(tmpdir(), 'harness-remote-'));
    spawnSync('git', ['init', '--quiet', '--bare', remote]);
    const hooks = `core.hooksPath=${join(REPOSITORY_ROOT, 'harness/git')}`;

    const push = spawnSync(
      'git',
      ['-c', hooks, 'push', '--dry-run', remote, 'HEAD:refs/heads/main'],
      { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
    );
    rmSync(remote, { recursive: true });

    expect(push.status).not.toBe(0);
    expect(push.stdout + push.stderr).toContain(PROTECTED);
  });
});
