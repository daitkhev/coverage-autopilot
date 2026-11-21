import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { GitCli } from '#repositories/infrastructure/git/git-cli.adapter';
import { CONFIGURATION_PLACES, GitPlanter } from '#tests/support/git-planter';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

const WIDGETS = 'acme/widgets';
const NEVER = new AbortController().signal;

let host: TemporaryCodeHost;
let planter: GitPlanter;
let snapshot: string;

/** The facts of the snapshot against the head, with git of these settings. */
async function compared(git: GitCli): Promise<unknown> {
  return git.compareRevisions(
    {
      repositoryId: RepositoryId.create('00000000-0000-4000-8000-000000000001'),
      url: RepositoryUrl.parse(TemporaryCodeHost.urlOf(WIDGETS)),
      branch: BranchName.create('main'),
      snapshotCommit: CommitSha.create(snapshot),
      targetFile: FilePath.create('src/a.ts'),
    },
    NEVER,
  );
}

beforeEach(() => {
  host = new TemporaryCodeHost();
  planter = new GitPlanter(host.folder);
  host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });
  snapshot = host.commit(WIDGETS, { '.gitattributes': planter.attributes() });
  host.commit(WIDGETS, { 'src/a.ts': '2\n' });
});

afterEach(() => {
  host.remove();
});

describe('GitCli', () => {
  describe.each(CONFIGURATION_PLACES)(
    'when $name defines drivers, hooks and a monitor',
    ({ place }) => {
      it('should start none of them as it compares revisions of a repository that selects them', async () => {
        const facts = await compared(
          new GitCli(planter.configuredIn(place, host.settings)),
        );

        expect(planter.ran()).toBe(false);
        expect(facts).toMatchObject({
          snapshotIsAncestor: true,
          targetFileChanged: true,
        });
      });
    },
  );

  describe('when git takes only a bare repository that a call names', () => {
    it('should still compare revisions in the mirror', async () => {
      const strict = join(host.folder, 'strict-gitconfig');
      writeFileSync(strict, '[safe]\n\tbareRepository = explicit\n');
      const settings = host.settings;

      const facts = await compared(
        new GitCli({
          ...settings,
          git: {
            ...settings.git,
            environment: {
              ...settings.git.environment,
              GIT_CONFIG_GLOBAL: strict,
            },
          },
        }),
      );

      expect(facts).toMatchObject({ targetFileChanged: true });
    });
  });
});
