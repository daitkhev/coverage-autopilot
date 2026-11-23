import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT } from '#harness/shared/policy';

/**
 * The real hook starts the real commitlint on a message, as git does. The
 * hook starts no gate, so no test can come back to itself through it.
 */
describe('the hook git runs on the message of a commit', () => {
  let folder = '';

  /** Runs the hook on a message, and gives what it said and how it ended. */
  function hook(message: string): { status: number | null; said: string } {
    const file = join(folder, 'COMMIT_EDITMSG');
    writeFileSync(file, message);
    const run = spawnSync('sh', ['harness/git/commit-msg', file], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    return { status: run.status, said: run.stdout + run.stderr };
  }

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'harness-message-'));
  });

  afterAll(() => {
    rmSync(folder, { recursive: true });
  });

  it.each([
    'feat: add the queue',
    'docs: add README',
    'build(deps): bump eslint from 10.15.0 to 10.16.0',
    'build(deps-dev): bump @types/node from 26.6.6 to 26.6.7',
    'fix: hold a claim\n\nA body of any width goes with it.\n',
    'feat: add the queue\n# a line git takes out of the message\n',
    "Merge branch 'dev' into main",
  ])('should take %j', (message) => {
    expect(hook(message)).toEqual({ status: 0, said: '' });
  });

  it.each([
    ['no type', 'add the queue', 'type-empty'],
    ['a type that is not in the list', 'wip: add the queue', 'type-enum'],
    ['a type in upper case', 'Feat: add the queue', 'type-case'],
    ['a scope', 'feat(queue): add the queue', 'scope-enum'],
    ['a subject that starts in upper case', 'feat: Add it', 'subject-case'],
    ['a full stop', 'feat: add the queue.', 'subject-full-stop'],
    ['no subject', 'feat:', 'subject-empty'],
    ['a header of 81 characters', `feat: ${'a'.repeat(75)}`, 'header-max'],
    ['a body with no line before it', 'feat: add it\nmore', 'body-leading'],
  ])('should refuse %s', (_name, message, rule) => {
    const run = hook(message);

    expect(run.said).toContain(`[${rule}`);
    expect(run.status).toBe(1);
  });

  it('should take a header of 80 characters', () => {
    expect(hook(`feat: ${'a'.repeat(74)}`).status).toBe(0);
  });
});

describe('the messages of the commits of this repository', () => {
  it('should hold the last commit to the rules', () => {
    const run = spawnSync(
      process.execPath,
      ['harness/bin/commit-messages.ts', 'HEAD~1', 'HEAD'],
      { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
    );

    expect(run.stdout + run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
