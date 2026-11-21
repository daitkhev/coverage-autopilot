import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCRIPTED_HEAD } from '#tests/support/scripted-git';

const NEVER = new AbortController().signal;
const SNAPSHOT = CommitSha.create('a'.repeat(40));
const TARGET = FilePath.create('src/a.ts');

let world: RepositoriesWorld;

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
});

describe('AssessRevisionHandler', () => {
  describe('execute', () => {
    it('should give the outcome the domain decides and the head', async () => {
      world.git.facts = {
        headCommit: SCRIPTED_HEAD,
        snapshotIsAncestor: true,
        targetFileChanged: true,
      };

      const assessment = await world.assessRevision.execute(
        {
          repositoryId: WIDGETS_ID,
          snapshotCommit: SNAPSHOT,
          targetFile: TARGET,
        },
        NEVER,
      );

      expect(assessment).toEqual({
        outcome: 'stale',
        headCommit: SCRIPTED_HEAD,
      });
      expect(world.git.calls).toEqual([
        `compareRevisions ${SNAPSHOT.value} src/a.ts`,
      ]);
    });

    it('should keep the head that git brought', async () => {
      await world.assessRevision.execute(
        {
          repositoryId: WIDGETS_ID,
          snapshotCommit: SNAPSHOT,
          targetFile: TARGET,
        },
        NEVER,
      );

      expect(world.repositories.saves[0]?.repository.head?.commit).toBe(
        SCRIPTED_HEAD,
      );
    });
  });
});
