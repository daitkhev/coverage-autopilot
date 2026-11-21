import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { PublishPatchCommand } from '#repositories/application/commands/publish-patch/publish-patch.command';
import { InvalidBranchNameError } from '#repositories/domain/errors/invalid-branch-name.error';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCRIPTED_HEAD } from '#tests/support/scripted-git';

const NEVER = new AbortController().signal;
const BASE = CommitSha.create('a'.repeat(40));
const BRANCH = 'coverage/src-a-ts';
const COPY = `publish_3a${WIDGETS_ID.value}_3acoverage_2fsrc-a-ts`;

const COMMAND: PublishPatchCommand = {
  repositoryId: WIDGETS_ID,
  baseCommit: BASE,
  patchText: 'the patch',
  branchName: BRANCH,
  commitMessage: 'test: cover src/a.ts',
  title: 'Cover src/a.ts',
  body: 'Raises the coverage of src/a.ts.',
};

let world: RepositoriesWorld;

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
});

describe('PublishPatchHandler', () => {
  describe('execute', () => {
    it('should push the patch from a clean copy of the base and open the pull request', async () => {
      const result = await world.publishPatch.execute(COMMAND, NEVER);

      expect(result).toEqual({
        outcome: 'published',
        branchName: BRANCH,
        pullRequestUrl: 'https://github.com/acme/widgets/pull/1',
        pullRequestNumber: 1,
      });
      expect(world.copies.calls).toEqual([
        `create ${COPY} of acme/widgets at ${BASE.value}`,
        `applyPatch ${COPY}: the patch`,
        `commitAndPush ${COPY} to ${BRANCH}: test: cover src/a.ts`,
        `dispose ${COPY}`,
      ]);
      expect(world.host.calls).toEqual([
        `findPullRequest ${BRANCH}`,
        `openPullRequest ${BRANCH} into main: Cover src/a.ts`,
      ]);
    });

    describe('when an earlier call opened the pull request', () => {
      it('should give it and push or open nothing', async () => {
        await world.publishPatch.execute(COMMAND, NEVER);
        world.copies.calls.length = 0;

        const again = await world.publishPatch.execute(COMMAND, NEVER);

        expect(again).toMatchObject({
          outcome: 'published',
          pullRequestNumber: 1,
        });
        expect(world.copies.calls).toEqual([]);
        expect(world.host.pullRequests.size).toBe(1);
      });
    });

    describe('when an earlier call pushed the branch and stopped', () => {
      it('should open the pull request and push nothing', async () => {
        world.git.branchHeads.set(BRANCH, {
          outcome: 'read',
          commit: SCRIPTED_HEAD,
        });

        const result = await world.publishPatch.execute(COMMAND, NEVER);

        expect(result).toMatchObject({ outcome: 'published' });
        expect(world.copies.calls).toEqual([]);
      });
    });

    describe('when git cannot read the branch on the host', () => {
      it('should answer refused with what git said', async () => {
        world.git.branchHeads.set(BRANCH, {
          outcome: 'refused',
          output: 'Authentication failed',
        });

        expect(await world.publishPatch.execute(COMMAND, NEVER)).toEqual({
          outcome: 'refused',
          reason: 'Authentication failed',
        });
      });
    });

    describe('when the patch does not apply to the base', () => {
      it('should answer refused, push nothing and dispose of the copy', async () => {
        world.copies.applyAnswer = {
          outcome: 'refused',
          reason: 'patch does not apply',
        };

        expect(await world.publishPatch.execute(COMMAND, NEVER)).toEqual({
          outcome: 'refused',
          reason: 'patch does not apply',
        });
        expect(world.copies.calls.at(-1)).toBe(`dispose ${COPY}`);
        expect(world.host.calls).toEqual([`findPullRequest ${BRANCH}`]);
      });
    });

    describe('when the host refuses the push', () => {
      it('should answer refused and open nothing', async () => {
        world.copies.pushAnswer = {
          outcome: 'refused',
          reason: 'protected branch',
        };

        expect(await world.publishPatch.execute(COMMAND, NEVER)).toEqual({
          outcome: 'refused',
          reason: 'protected branch',
        });
        expect(world.host.pullRequests.size).toBe(0);
      });
    });

    describe('when the host refuses the pull request', () => {
      it('should answer refused with what gh said', async () => {
        world.host.openRefusal = 'No commits between main and it.';

        expect(await world.publishPatch.execute(COMMAND, NEVER)).toEqual({
          outcome: 'refused',
          reason: 'No commits between main and it.',
        });
      });
    });

    describe('when the branch is not a name git takes', () => {
      it('should throw InvalidBranchNameError and ask nothing', async () => {
        await expect(
          world.publishPatch.execute(
            { ...COMMAND, branchName: '--force' },
            NEVER,
          ),
        ).rejects.toThrow(InvalidBranchNameError);
        expect(world.host.calls).toEqual([]);
      });
    });
  });
});
