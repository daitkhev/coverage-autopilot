import { beforeEach, describe, expect, it } from 'vitest';

import { RepositoryNotFoundError } from '#repositories/application/errors/repository-not-found.error';
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

describe('CheckAccessHandler', () => {
  describe('execute', () => {
    it('should give the check and keep the head it read', async () => {
      const check = await world.checkAccess.execute(
        { repositoryId: WIDGETS_ID.value },
        NEVER,
      );

      expect(check).toMatchObject({
        repositoryId: WIDGETS_ID,
        passed: true,
        headCommit: SCRIPTED_HEAD,
        destination: { route: 'repository' },
      });
      expect(check?.checkedAt.toString()).toBe(STORED_TIME);
      expect(check?.steps).toHaveLength(3);
      const kept = world.repositories.saves[0]?.repository.head;
      expect(kept?.commit).toBe(SCRIPTED_HEAD);
      expect(kept?.readAt.toString()).toBe(STORED_TIME);
    });

    describe('when the check stops before the head', () => {
      it('should save nothing', async () => {
        world.host.loginAnswer = { outcome: 'missing' };

        const check = await world.checkAccess.execute(
          { repositoryId: WIDGETS_ID.value },
          NEVER,
        );

        expect(check?.passed).toBe(false);
        expect(world.repositories.saves).toEqual([]);
        expect(world.transactions.runs).toBe(0);
      });
    });

    describe('when no repository has the id', () => {
      it.each([
        ['another id', '00000000-0000-4000-8000-0000000000ff'],
        ['a text that is no id', 'acme-widgets'],
      ])('should give null for %s and ask no tool', async (_case, id) => {
        const check = await world.checkAccess.execute(
          { repositoryId: id },
          NEVER,
        );

        expect(check).toBeNull();
        expect(world.git.calls).toEqual([]);
      });
    });
  });

  describe('RepositoryNotFoundError', () => {
    it('should be a fault of the application that is not retried', () => {
      expect(new RepositoryNotFoundError('x')).toMatchObject({
        name: 'RepositoryNotFoundError',
        code: 'repository_not_found',
        retryable: false,
      });
    });
  });
});
