import { beforeEach, describe, expect, it } from 'vitest';

import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { NOT_A_REPOSITORY_URL } from '#repositories/domain/value-objects/repository-url.vo';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { STORED_TIME } from '#tests/support/schema-rows';

const NEVER = new AbortController().signal;
const FIRST_ID = '00000000-0000-4000-8000-000000000001';

let world: RepositoriesWorld;

beforeEach(() => {
  world = new RepositoriesWorld();
});

describe('ConnectRepositoryHandler', () => {
  describe('execute', () => {
    it('should connect the repository with the default branch of the host', async () => {
      world.git.defaultBranchAnswer = {
        outcome: 'read',
        branch: BranchName.create('trunk'),
      };

      const result = await world.connect.execute(
        { url: 'https://github.com/acme/widgets.git' },
        NEVER,
      );

      expect(result).toEqual({
        outcome: 'connected',
        repository: expect.objectContaining({
          owner: 'acme',
          name: 'widgets',
          url: 'https://github.com/acme/widgets',
          defaultBranch: 'trunk',
          headCommit: null,
          headCheckedAt: null,
        }) as unknown,
      });
      const saved = world.repositories.saves[0];
      expect(saved?.repository.id.value).toBe(FIRST_ID);
      expect(saved?.repository.connectedAt.toString()).toBe(STORED_TIME);
      expect(saved?.transaction).toBe(world.transactions.transaction);
    });

    describe('when the same owner and name are connected already', () => {
      it('should give that repository and ask the host nothing', async () => {
        await world.connected();

        const result = await world.connect.execute(
          { url: 'https://github.com/ACME/Widgets/' },
          NEVER,
        );

        expect(result).toMatchObject({
          outcome: 'already_connected',
          repository: { id: WIDGETS_ID },
        });
        expect(world.git.calls).toEqual([]);
        expect(world.repositories.saves).toEqual([]);
      });
    });

    describe('when another call connects it while git reads the host', () => {
      it('should give the repository that call saved', async () => {
        const read = world.git.readDefaultBranch.bind(world.git);
        world.git.readDefaultBranch = async (url) => {
          await world.connected();
          return read(url);
        };

        const result = await world.connect.execute(
          { url: 'https://github.com/acme/widgets' },
          NEVER,
        );

        expect(result.outcome).toBe('already_connected');
        expect(world.repositories.saves).toEqual([]);
      });
    });

    describe('when git cannot read the repository', () => {
      it('should answer unreachable with what git said and save nothing', async () => {
        world.git.defaultBranchAnswer = {
          outcome: 'refused',
          output: 'Repository not found.',
        };

        expect(
          await world.connect.execute(
            { url: 'https://github.com/acme/widgets' },
            NEVER,
          ),
        ).toEqual({
          outcome: 'unreachable',
          reason:
            'git could not read acme/widgets. It said: Repository not found.',
        });
        expect(world.repositories.saves).toEqual([]);
      });
    });

    describe('when the address is not one of a repository', () => {
      it('should answer invalid_url without the text and ask nothing', async () => {
        const result = await world.connect.execute(
          { url: 'https://token@github.com/acme/widgets' },
          NEVER,
        );

        expect(result).toEqual({
          outcome: 'invalid_url',
          reason: NOT_A_REPOSITORY_URL,
        });
        expect(JSON.stringify(result)).not.toContain('token');
        expect(world.git.calls).toEqual([]);
      });
    });
  });
});
