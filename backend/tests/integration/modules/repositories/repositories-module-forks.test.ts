import { existsSync } from 'node:fs';

import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import {
  type PublishPatchResult,
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/application/contracts/repositories-public-api';
import { RepositoriesModule } from '#repositories/repositories.module';
import { SharedTestModule } from '#tests/support/shared-test-module';
import { withStandInCoverage } from '#tests/support/stand-in-repository-coverage';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

const UPSTREAM = 'acme/gadgets';
const FORK = 'acme-bot/gadgets';
const NEVER = new AbortController().signal;

/** A new test file, as `git diff` writes one. */
const PATCH = [
  'diff --git a/src/a.test.ts b/src/a.test.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/a.test.ts',
  '@@ -0,0 +1 @@',
  '+test("a", () => {});',
  '',
].join('\n');

let host: TemporaryCodeHost;
let module: TestingModule;
let api: RepositoriesPublicApi;
let repositoryId: RepositoryId;
let first: string;

/** The patch published on a branch of its own, from the commit. */
async function publish(
  commit: string,
  branchName = 'coverage-autopilot/improvement-1',
): Promise<PublishPatchResult> {
  return api.publishPatch(
    {
      repositoryId,
      baseCommit: CommitSha.create(commit),
      patchText: PATCH,
      branchName,
      commitMessage: 'test: cover src/a.ts',
      title: 'Cover src/a.ts',
      body: 'Raises the coverage of src/a.ts.',
    },
    NEVER,
  );
}

/** Runs git of the host in the bare repository behind a name. */
function gitOf(fullName: string, ...args: string[]): string {
  return host.git(host.remoteOf(fullName), ...args);
}

/** The commit each branch of a repository of the host is at, by name. */
function branchesOf(fullName: string): Record<string, string> {
  const lines = gitOf(
    fullName,
    'for-each-ref',
    '--format=%(refname:short) %(objectname)',
    'refs/heads/',
  );
  return Object.fromEntries(
    lines.split('\n').map((line): [string, string] => {
      const [name = '', commit = ''] = line.split(' ');
      return [name, commit];
    }),
  );
}

/** How many times `gh` was called with these first arguments. */
function asked(...start: string[]): number {
  return host.gh
    .calls()
    .filter((call) => start.every((arg, at) => call.arguments[at] === arg))
    .length;
}

beforeEach(async () => {
  host = new TemporaryCodeHost();
  first = host.createRepository(UPSTREAM, { 'src/a.ts': 'export {};\n' });
  host.gh.answer({ canPush: false });
  module = await Test.createTestingModule({
    imports: [
      SharedTestModule.create(),
      withStandInCoverage(RepositoriesModule.register(host.settings)),
    ],
  }).compile();
  await module.init();
  api = module.get(REPOSITORIES_PUBLIC_API);
  const connected = await module
    .get(ConnectRepositoryHandler)
    .execute({ url: TemporaryCodeHost.urlOf(UPSTREAM) }, NEVER);
  if (!('repository' in connected)) {
    throw new Error(connected.reason);
  }
  repositoryId = connected.repository.id;
});

afterEach(async () => {
  await module.close();
  host.remove();
});

describe('RepositoriesModule, for an account that may not push', () => {
  it('should pass the access check and name the account of the fork', async () => {
    const check = await api.checkAccess({ repositoryId }, NEVER);

    expect(check).toMatchObject({
      passed: true,
      destination: { route: 'fork', account: 'acme-bot' },
    });
    expect(existsSync(host.remoteOf(FORK))).toBe(false);
  });

  describe('publishPatch', () => {
    it('should publish in a fork once, however often it is called', async () => {
      const published = await publish(first);
      const again = await publish(first);

      expect(published).toEqual({
        outcome: 'published',
        branchName: 'coverage-autopilot/improvement-1',
        pullRequestUrl: `https://github.com/${FORK}/pull/1`,
        pullRequestNumber: 1,
      });
      expect(again).toEqual(published);
      expect(branchesOf(UPSTREAM)).toEqual({ main: first });
      expect(host.gh.pullRequests()).toEqual([
        expect.objectContaining({
          head: 'coverage-autopilot/improvement-1',
          base: `coverage-autopilot/base-${first}`,
        }),
      ]);
      expect(asked('pr', 'create')).toBe(1);
      expect(asked('api', '--method=POST')).toBe(2);
      expect(existsSync(host.remoteOf(`${FORK}-1`))).toBe(false);
    });

    it('should base the pull request on the commit, however far behind the fork is', async () => {
      await publish(first);
      const later = host.commit(UPSTREAM, { 'src/b.ts': 'export {};\n' });

      await publish(later, 'coverage-autopilot/improvement-2');

      const fork = branchesOf(FORK);
      expect(fork['main']).toBe(first);
      expect(fork[`coverage-autopilot/base-${later}`]).toBe(later);
      expect(
        gitOf(
          FORK,
          'log',
          '--format=%s',
          `coverage-autopilot/base-${later}..coverage-autopilot/improvement-2`,
        ),
      ).toBe('test: cover src/a.ts');
      expect(
        gitOf(FORK, 'show', 'coverage-autopilot/improvement-2:src/a.test.ts'),
      ).toBe('test("a", () => {});');
    });

    describe('when the account has a repository of that name', () => {
      it('should publish in the fork the host named', async () => {
        host.createRepository(FORK, { 'own.txt': 'own\n' });

        expect(await publish(first)).toMatchObject({
          pullRequestUrl: `https://github.com/${FORK}-1/pull/1`,
        });
        expect(Object.keys(branchesOf(FORK))).toEqual(['main']);
      });
    });

    describe('when the host will not fork', () => {
      it('should answer refused in its words and push nothing', async () => {
        host.gh.answer({
          canPush: false,
          forkRefusal: 'gh: Forking is disabled. (HTTP 403)\n',
        });

        expect(await publish(first)).toEqual({
          outcome: 'refused',
          reason: 'gh: Forking is disabled. (HTTP 403)',
        });
        expect(branchesOf(UPSTREAM)).toEqual({ main: first });
        expect(asked('pr')).toBe(0);
      });
    });
  });
});
