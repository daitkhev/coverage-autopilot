import { spawnSync } from 'node:child_process';

import { beforeEach, describe, expect, it } from 'vitest';

import { beforePush, type PushChecks } from '#harness/agents/before-push';
import type { GateRun } from '#harness/agents/full-gate';
import { readLastVerdict } from '#harness/agents/last-verdict';
import { currentBranch, isAncestor } from '#harness/architecture/git';
import { HarnessError } from '#harness/shared/harness.error';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

const NO_COMMIT = '0'.repeat(40);
const RED: GateRun = {
  passed: false,
  output: '\n== lint\na.ts: 1 problem\n\ncheck full: failed at lint\n',
};
const GREEN: GateRun = { passed: true, output: '\ncheck full: passed\n' };

const PROTECTED =
  'push refused: A push to main is denied. ' +
  'It takes changes through a pull request.';
const FORCED =
  'push refused: A forced push is denied. ' +
  'History that was pushed is not rewritten.';

describe('beforePush', () => {
  let first = '';
  let second = '';
  let judged = 0;

  /** The line git writes for a name it is about to update. */
  function line(remoteRef: string, local: string, remote: string): string {
    return `refs/heads/dev ${local} ${remoteRef} ${remote}\n`;
  }

  function checks(run: GateRun): PushChecks {
    return {
      isAncestor: (older, newer) =>
        isAncestor(bench.repository.root, older, newer),
      judge: () => {
        judged += 1;
        return run;
      },
    };
  }

  const push = (input: string, run = GREEN): number =>
    beforePush(input, bench.host, checks(run));

  beforeEach(() => {
    judged = 0;
    bench.repository.write('.gitignore', '/reports/\n');
    bench.repository.write('a.ts', 'export const a = 1;\n');
    first = bench.repository.commit();
    bench.repository.write('a.ts', 'export const a = 2;\n');
    second = bench.repository.commit();
  });

  it('should let a push that adds commits to a branch through', () => {
    expect(push(line('refs/heads/dev', second, first))).toBe(0);
    expect(bench.host.printed).toEqual([]);
    expect(judged).toBe(1);
  });

  it('should let a new branch and a removed branch through', () => {
    const input =
      line('refs/heads/new', second, NO_COMMIT) +
      line('refs/heads/old', NO_COMMIT, first);

    expect(push(input)).toBe(0);
  });

  it('should refuse a push to the protected branch, however it is named', () => {
    expect(push(line('refs/heads/main', second, first))).toBe(1);
    expect(bench.host.printed).toEqual([PROTECTED]);
    expect(judged).toBe(0);
  });

  it('should refuse to remove the protected branch', () => {
    expect(push(line('refs/heads/main', NO_COMMIT, first))).toBe(1);
  });

  it('should not take another name for the protected branch', () => {
    expect(push(line('refs/heads/maintenance', second, first))).toBe(0);
    expect(push(line('refs/tags/main', second, first))).toBe(0);
  });

  it('should refuse a push that takes commits away from the remote', () => {
    expect(push(line('refs/heads/dev', first, second))).toBe(1);
    expect(bench.host.printed).toEqual([FORCED]);
    expect(judged).toBe(0);
  });

  it('should refuse when one name of several loses commits', () => {
    const input =
      line('refs/heads/dev', second, first) +
      line('refs/heads/other', first, second);

    expect(push(input)).toBe(1);
    expect(bench.host.printed).toEqual([FORCED]);
  });

  it('should refuse a push over a commit this clone does not have', () => {
    const unknown = 'a'.repeat(40);

    expect(push(line('refs/heads/dev', second, unknown))).toBe(1);
    expect(bench.host.printed).toEqual([FORCED]);
  });

  it('should find the refused name among the names of one push', () => {
    const input =
      line('refs/heads/dev', second, first) +
      line('refs/heads/main', second, first);

    expect(push(input)).toBe(1);
    expect(bench.host.printed).toEqual([PROTECTED]);
  });

  it('should refuse a tree that the full gate does not pass', () => {
    expect(push(line('refs/heads/dev', second, first), RED)).toBe(1);
    expect(bench.host.printed).toEqual([
      'push refused: check full is red at lint. Make it green, ' +
        'then push again.\n\na.ts: 1 problem\n\ncheck full: failed at lint',
    ]);
  });

  it('should refuse the same red tree again, without a second run', () => {
    push(line('refs/heads/dev', second, first), RED);

    expect(push(line('refs/heads/dev', second, first), GREEN)).toBe(1);
    expect(bench.host.printed.at(-1)).toBe(
      'push refused: check full is red at lint on this tree. ' +
        'Run node harness/bin/check.ts full to see it.',
    );
    expect(judged).toBe(1);
  });

  it('should not judge again a tree that passed', () => {
    push(line('refs/heads/dev', second, first));

    expect(push(line('refs/heads/dev', second, first), RED)).toBe(0);
    expect(judged).toBe(1);
  });

  it('should judge nothing when git updates nothing', () => {
    expect(push('', RED)).toBe(0);
    expect(push('\n', RED)).toBe(0);
    expect(judged).toBe(0);
  });

  it('should refuse a push whose lines it cannot read', () => {
    expect(push('refs/heads/dev abc\n')).toBe(1);
    expect(bench.host.printed).toEqual([
      'Git gave the hook a line it cannot read: refs/heads/dev abc',
    ]);
  });

  it('should refuse a push, and keep no verdict, when the gate cannot run', () => {
    const nested: PushChecks = {
      isAncestor: () => true,
      judge: () => {
        throw new HarnessError('A gate does not start a gate.');
      },
    };

    expect(
      beforePush(line('refs/heads/dev', second, first), bench.host, nested),
    ).toBe(1);
    expect(bench.host.printed).toEqual(['A gate does not start a gate.']);
    expect(readLastVerdict(bench.repository.root)).toBeUndefined();
  });
});

describe('the git of a tree', () => {
  it('should say which branch the tree is on', () => {
    bench.repository.write('a.ts', '');
    bench.repository.commit();

    expect(currentBranch(bench.repository.root)).toBe('main');
  });

  it('should say nothing for a tree on no branch', () => {
    bench.repository.write('a.ts', '');
    const commit = bench.repository.commit();
    spawnSync('git', ['checkout', '--quiet', '--detach', commit], {
      cwd: bench.repository.root,
    });

    expect(currentBranch(bench.repository.root)).toBe('');
  });

  it('should tell a commit in the history from one that is not', () => {
    bench.repository.write('a.ts', '');
    const older = bench.repository.commit();
    bench.repository.write('a.ts', 'export const a = 1;\n');
    const newer = bench.repository.commit();

    expect(isAncestor(bench.repository.root, older, newer)).toBe(true);
    expect(isAncestor(bench.repository.root, newer, older)).toBe(false);
  });
});
