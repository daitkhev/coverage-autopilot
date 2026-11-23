import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { PushResult } from '#repositories/application/ports/working-copies.port';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import { COPY, WorkingCopyFixture } from '#tests/support/working-copy-fixture';

/** A repository of the account, far behind: it shares no commit. */
const FORK = 'acme-bot/widgets';
const TESTS = BranchName.create('coverage-autopilot/improvement-1');
const NEVER = new AbortController().signal;

let fixture: WorkingCopyFixture;
let fork: string;
let base: BranchName;

/** A test file in a new copy of the first commit, pushed to the fork. */
async function pushed(tests = TESTS): Promise<PushResult> {
  const path = await fixture.created();
  writeFileSync(join(path, 'src/a.test.ts'), 'test();\n');
  return fixture.copies.commitAndPush(
    {
      id: COPY,
      url: RepositoryUrl.parse(TemporaryCodeHost.urlOf(FORK)),
      branch: tests,
      commitMessage: 'test: cover a',
      base: { branch: base, commit: CommitSha.create(fixture.first) },
    },
    NEVER,
  );
}

/** The commit a branch of the fork is at, or nothing when it is not there. */
function headOf(branch: BranchName): string {
  return fixture.host.git(
    fixture.host.remoteOf(FORK),
    'for-each-ref',
    '--format=%(objectname)',
    branch.ref,
  );
}

beforeEach(() => {
  fixture = new WorkingCopyFixture();
  fork = fixture.host.createRepository(FORK, { 'README.md': 'old\n' });
  base = BranchName.create(`coverage-autopilot/base-${fixture.first}`);
});

afterEach(() => {
  fixture.remove();
});

describe('GitWorkingCopies', () => {
  describe('commitAndPush', () => {
    describe('when the request names a base', () => {
      it('should push the base at its commit and the tests on top of it', async () => {
        expect(await pushed()).toEqual({ outcome: 'pushed' });
        expect(headOf(base)).toBe(fixture.first);
        expect(
          fixture.host.git(
            fixture.host.remoteOf(FORK),
            'rev-list',
            '--count',
            `${base.ref}..${TESTS.ref}`,
          ),
        ).toBe('1');
        expect(headOf(BranchName.create('main'))).toBe(fork);
      });

      describe('when the fork has the base at its commit already', () => {
        it('should push the tests and leave the base as it was', async () => {
          await pushed();
          const other = BranchName.create('coverage-autopilot/improvement-2');

          expect(await pushed(other)).toEqual({ outcome: 'pushed' });
          expect(headOf(base)).toBe(fixture.first);
          expect(headOf(other)).not.toBe('');
        });
      });

      describe('when the fork has the base at another commit', () => {
        it('should answer refused and push neither branch', async () => {
          fixture.host.commit(FORK, { 'x.txt': 'x\n' }, { branch: base.value });
          const moved = headOf(base);

          expect(await pushed()).toEqual({
            outcome: 'refused',
            reason: expect.stringContaining('rejected') as unknown,
          });
          expect(headOf(base)).toBe(moved);
          expect(headOf(TESTS)).toBe('');
        });
      });
    });
  });
});
