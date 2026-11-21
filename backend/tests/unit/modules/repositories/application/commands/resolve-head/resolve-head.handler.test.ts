import { beforeEach, describe, expect, it } from 'vitest';

import { HeadNotReadError } from '#repositories/application/errors/head-not-read.error';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { STORED_TIME } from '#tests/support/schema-rows';
import { SCRIPTED_HEAD } from '#tests/support/scripted-git';

const NEVER = new AbortController().signal;

let world: RepositoriesWorld;

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
});

describe('ResolveHeadHandler', () => {
  describe('execute', () => {
    it('should give the head of the default branch and keep it', async () => {
      const head = await world.resolveHead.execute(
        { repositoryId: WIDGETS_ID },
        NEVER,
      );

      expect(head).toBe(SCRIPTED_HEAD);
      expect(world.git.calls).toEqual(['readBranchHead main']);
      const kept = world.repositories.saves[0]?.repository.head;
      expect(kept?.commit).toBe(SCRIPTED_HEAD);
      expect(kept?.readAt.toString()).toBe(STORED_TIME);
    });

    describe('when the default branch is gone', () => {
      it('should throw HeadNotReadError that says so', async () => {
        world.git.branchHeads.clear();

        await expect(
          world.resolveHead.execute({ repositoryId: WIDGETS_ID }, NEVER),
        ).rejects.toThrow('acme/widgets has no branch main any more.');
        expect(world.repositories.saves).toEqual([]);
      });
    });

    describe('when git cannot read the host', () => {
      it('should throw HeadNotReadError with what git said', async () => {
        world.git.branchHeads.set('main', {
          outcome: 'refused',
          output: 'Could not resolve host',
        });

        await expect(
          world.resolveHead.execute({ repositoryId: WIDGETS_ID }, NEVER),
        ).rejects.toThrow(HeadNotReadError);
        await expect(
          world.resolveHead.execute({ repositoryId: WIDGETS_ID }, NEVER),
        ).rejects.toThrow('It said: Could not resolve host');
      });
    });
  });

  describe('HeadNotReadError', () => {
    it('should be a fault of the application that may pass on a later try', () => {
      expect(new HeadNotReadError('x')).toMatchObject({
        name: 'HeadNotReadError',
        code: 'head_not_read',
        retryable: true,
      });
    });
  });
});
