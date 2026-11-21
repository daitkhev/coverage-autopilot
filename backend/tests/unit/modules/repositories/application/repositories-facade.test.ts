import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { InvalidWorkingCopyIdError } from '#repositories/domain/errors/invalid-working-copy-id.error';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCRIPTED_HEAD } from '#tests/support/scripted-git';

const NEVER = new AbortController().signal;
const COMMIT = CommitSha.create('a'.repeat(40));
const REQUEST = { repositoryId: WIDGETS_ID };

let world: RepositoriesWorld;

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
});

describe('RepositoriesFacade', () => {
  describe('getRepository', () => {
    it('should give the repository of the id', async () => {
      expect((await world.facade.getRepository(REQUEST))?.id).toBe(WIDGETS_ID);
    });
  });

  describe('checkAccess', () => {
    it('should give the access check of the repository', async () => {
      expect((await world.facade.checkAccess(REQUEST, NEVER)).passed).toBe(
        true,
      );
    });
  });

  describe('resolveHead', () => {
    it('should give the head of the default branch', async () => {
      expect(await world.facade.resolveHead(REQUEST, NEVER)).toBe(
        SCRIPTED_HEAD,
      );
    });
  });

  describe('assessRevision', () => {
    it('should give the assessment of the snapshot commit', async () => {
      expect(
        await world.facade.assessRevision(
          {
            ...REQUEST,
            snapshotCommit: SCRIPTED_HEAD,
            targetFile: FilePath.create('src/a.ts'),
          },
          NEVER,
        ),
      ).toEqual({ outcome: 'current', headCommit: SCRIPTED_HEAD });
    });
  });

  describe('createWorkingCopy', () => {
    it('should give the copy it made', async () => {
      const copy = await world.facade.createWorkingCopy(
        { ...REQUEST, commit: COMMIT, purpose: 'scan:1' },
        NEVER,
      );

      expect(copy.path).toBe('/copies/scan_3a1');
    });
  });

  describe('disposeWorkingCopy', () => {
    it('should dispose of the copy of the id', async () => {
      await world.facade.disposeWorkingCopy({ workingCopyId: 'scan_3a1' });

      expect(world.copies.calls).toEqual(['dispose scan_3a1']);
    });

    describe('when the id is not one of a copy', () => {
      it('should throw InvalidWorkingCopyIdError and touch no folder', async () => {
        await expect(
          world.facade.disposeWorkingCopy({ workingCopyId: '../..' }),
        ).rejects.toThrow(InvalidWorkingCopyIdError);
        expect(world.copies.calls).toEqual([]);
      });
    });
  });

  describe('extractPatch', () => {
    it('should give the patch of the copy', async () => {
      expect(
        await world.facade.extractPatch({ workingCopyId: 'scan_3a1' }),
      ).toEqual({ outcome: 'empty' });
      expect(world.copies.calls).toEqual(['extractPatch scan_3a1']);
    });
  });

  describe('applyPatch', () => {
    it('should apply the text to the copy', async () => {
      expect(
        await world.facade.applyPatch({
          workingCopyId: 'scan_3a1',
          patchText: 'the patch',
        }),
      ).toEqual({ outcome: 'applied', files: [] });
      expect(world.copies.calls).toEqual(['applyPatch scan_3a1: the patch']);
    });
  });

  describe('publishPatch', () => {
    it('should publish the patch', async () => {
      const result = await world.facade.publishPatch(
        {
          ...REQUEST,
          baseCommit: COMMIT,
          patchText: 'the patch',
          branchName: 'coverage/a',
          commitMessage: 'test: cover a',
          title: 'Cover a',
          body: 'Covers a.',
        },
        NEVER,
      );

      expect(result).toMatchObject({ outcome: 'published' });
    });
  });
});
