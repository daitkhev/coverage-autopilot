import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import {
  type PublishPatchRequest,
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';
import { InvalidRepositoriesSettingsError } from '#repositories/infrastructure/errors/invalid-repositories-settings.error';
import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';
import { RepositoriesModule } from '#repositories/repositories.module';
import { SharedTestModule } from '#tests/support/shared-test-module';
import {
  SECRET_TOKEN,
  TemporaryCodeHost,
} from '#tests/support/temporary-code-host';

const WIDGETS = 'acme/widgets';
const BRANCH = 'coverage/src-a-ts';
const NEVER = new AbortController().signal;

let host: TemporaryCodeHost;
let module: TestingModule;
let api: RepositoriesPublicApi;
let base: string;

async function compiled(
  settings: RepositoriesSettings,
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [SharedTestModule.create(), RepositoriesModule.register(settings)],
  }).compile();
}

/** Connects `acme/widgets` and gives its id. */
async function connected(): Promise<RepositoryId> {
  const result = await module
    .get(ConnectRepositoryHandler)
    .execute({ url: TemporaryCodeHost.urlOf(WIDGETS) }, NEVER);
  if (result.outcome === 'unreachable') {
    throw new Error(result.reason);
  }
  return result.repository.id;
}

/** A patch that adds a test, taken from a copy of the base. */
async function patchOf(repositoryId: RepositoryId): Promise<string> {
  const copy = await api.createWorkingCopy(
    {
      repositoryId,
      commit: CommitSha.create(base),
      purpose: 'improvement:1:attempt:1',
    },
    NEVER,
  );
  writeFileSync(join(copy.path, 'src/a.test.ts'), 'test("a", () => {});\n');
  const extracted = await api.extractPatch({ workingCopyId: copy.id });
  await api.disposeWorkingCopy({ workingCopyId: copy.id });
  return extracted.outcome === 'extracted' ? extracted.patch.text : '';
}

function publication(
  repositoryId: RepositoryId,
  patchText: string,
): PublishPatchRequest {
  return {
    repositoryId,
    baseCommit: CommitSha.create(base),
    patchText,
    branchName: BRANCH,
    commitMessage: 'test: cover src/a.ts',
    title: 'Cover src/a.ts',
    body: 'Raises the coverage of src/a.ts.',
  };
}

/** The commit of the branch on the host, or nothing when it is not there. */
function branchOnHost(): string {
  return host.git(
    host.remoteOf(WIDGETS),
    'for-each-ref',
    '--format=%(objectname)',
    `refs/heads/${BRANCH}`,
  );
}

function created(): number {
  return host.gh
    .calls()
    .filter((call) => call.arguments.slice(0, 2).join(' ') === 'pr create')
    .length;
}

beforeEach(async () => {
  host = new TemporaryCodeHost();
  base = host.createRepository(WIDGETS, {
    'src/a.ts': 'export const a = 1;\n',
  });
  module = await (await compiled(host.settings)).init();
  api = module.get(REPOSITORIES_PUBLIC_API);
});

afterEach(async () => {
  await module.close();
  host.remove();
});

describe('RepositoriesModule', () => {
  describe('register', () => {
    it('should check access, read the head and keep it with the repository', async () => {
      const repositoryId = await connected();

      const check = await api.checkAccess({ repositoryId }, NEVER);

      expect(check.passed).toBe(true);
      expect(check.headCommit?.value).toBe(base);
      expect(
        (await api.getRepository({ repositoryId }))?.headCommit?.value,
      ).toBe(base);
      expect((await api.resolveHead({ repositoryId }, NEVER)).value).toBe(base);
      expect(
        await api.assessRevision(
          {
            repositoryId,
            snapshotCommit: CommitSha.create(base),
            targetFile: FilePath.create('src/a.ts'),
          },
          NEVER,
        ),
      ).toMatchObject({ outcome: 'current' });
    });

    describe('when the settings cannot work', () => {
      it('should refuse to start with no secret in the message', async () => {
        const refused = await compiled({
          ...host.settings,
          workingCopiesRoot: 'relative/folder',
          gh: { ...host.settings.gh, timeoutMs: 0 },
        });

        const starting = refused.init();

        await expect(starting).rejects.toThrow(
          InvalidRepositoriesSettingsError,
        );
        await expect(starting).rejects.toThrow('workingCopiesRoot');
        await expect(starting).rejects.not.toThrow(SECRET_TOKEN);
        await refused.close();
      });

      it('should refuse a git that is not told who commits', async () => {
        const settings = host.settings;
        const environment = Object.fromEntries(
          Object.entries(settings.git.environment).filter(
            ([name]) => name !== 'GIT_COMMITTER_EMAIL',
          ),
        );
        const refused = await compiled({
          ...settings,
          git: { ...settings.git, environment },
        });

        await expect(refused.init()).rejects.toThrow(
          'The environment of git does not say who commits. It needs ' +
            'GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME, ' +
            'GIT_COMMITTER_EMAIL.',
        );
        await refused.close();
      });
    });
  });

  describe('publishPatch', () => {
    it('should push the branch and open the pull request once, however often it is called', async () => {
      const repositoryId = await connected();
      const request = publication(repositoryId, await patchOf(repositoryId));

      const first = await api.publishPatch(request, NEVER);
      const pushed = branchOnHost();
      const second = await api.publishPatch(request, NEVER);

      expect(first).toEqual({
        outcome: 'published',
        branchName: BRANCH,
        pullRequestUrl: 'https://github.com/acme/widgets/pull/1',
        pullRequestNumber: 1,
      });
      expect(second).toEqual(first);
      expect(branchOnHost()).toBe(pushed);
      expect(created()).toBe(1);
      expect(
        host.git(
          host.remoteOf(WIDGETS),
          'log',
          '-1',
          '--format=%s%n%P',
          pushed,
        ),
      ).toBe(`test: cover src/a.ts\n${base}`);
      expect(
        host.git(host.remoteOf(WIDGETS), 'show', `${pushed}:src/a.test.ts`),
      ).toBe('test("a", () => {});');
      expect(host.gh.pullRequests()[0]).toMatchObject({
        head: BRANCH,
        base: 'main',
        title: 'Cover src/a.ts',
        body: 'Raises the coverage of src/a.ts.',
      });
      expect(
        readdirSync(join(host.settings.workingCopiesRoot, 'copies')),
      ).toEqual([]);
    });

    describe('when the pull request was refused after the push', () => {
      it('should open it on the next call and push nothing new', async () => {
        const repositoryId = await connected();
        const request = publication(repositoryId, await patchOf(repositoryId));
        host.gh.answer({ createRefusal: 'The host is busy.' });

        const refused = await api.publishPatch(request, NEVER);
        const pushed = branchOnHost();
        host.gh.answer({});
        const published = await api.publishPatch(request, NEVER);

        expect(refused).toEqual({
          outcome: 'refused',
          reason: 'The host is busy.',
        });
        expect(published).toMatchObject({ outcome: 'published' });
        expect(branchOnHost()).toBe(pushed);
      });
    });

    describe('when the patch does not apply to the base', () => {
      it('should answer refused and push nothing', async () => {
        const repositoryId = await connected();

        const result = await api.publishPatch(
          publication(repositoryId, 'not a patch'),
          NEVER,
        );

        expect(result).toMatchObject({ outcome: 'refused' });
        expect(branchOnHost()).toBe('');
        expect(created()).toBe(0);
      });
    });
  });
});
