import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { InvalidWorkingCopyIdError } from '#repositories/domain/errors/invalid-working-copy-id.error';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';

const NEVER = new AbortController().signal;
const COMMIT = CommitSha.create('a'.repeat(40));

let world: RepositoriesWorld;

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
});

describe('CreateWorkingCopyHandler', () => {
  describe('execute', () => {
    it('should make the copy in the folder its purpose names', async () => {
      const copy = await world.createWorkingCopy.execute(
        { repositoryId: WIDGETS_ID, commit: COMMIT, purpose: 'scan:7' },
        NEVER,
      );

      expect(copy).toEqual({
        id: 'scan_3a7',
        repositoryId: WIDGETS_ID,
        commit: COMMIT,
        path: '/copies/scan_3a7',
      });
      expect(world.copies.calls).toEqual([
        `create scan_3a7 of acme/widgets at ${COMMIT.value}`,
      ]);
    });

    describe('when the purpose cannot name a folder', () => {
      it('should throw InvalidWorkingCopyIdError and make nothing', async () => {
        await expect(
          world.createWorkingCopy.execute(
            { repositoryId: WIDGETS_ID, commit: COMMIT, purpose: '' },
            NEVER,
          ),
        ).rejects.toThrow(InvalidWorkingCopyIdError);
        expect(world.copies.calls).toEqual([]);
      });
    });
  });
});
