import { describe, expect, it } from 'vitest';

import { repoList } from '#commands/repo-list';
import { answered, refused } from '#tests/support/fake-service-api';
import { expectRefusal, recordingIo } from '#tests/support/sample-command-io';
import {
  FAILING_TESTS_REPOSITORY,
  REPOSITORY_LIST,
  TRUSTED_REPOSITORY,
} from '#tests/support/sample-repositories';

const LIST = { name: 'repo list' } as const;

describe('repoList', () => {
  it('should print one aligned line for each repository', async () => {
    const io = recordingIo({
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
    });

    await expect(repoList(LIST, io)).resolves.toBe(0);

    expect(io.printed).toMatchInlineSnapshot(`
      [
        "example/payments     71.4%        12 below  main  4f2a9c1  scanned 2h ago",
        "example/gateway      not scanned            main                           scanning (scan-gateway-1)",
        "example/billing-api  71.4%        12 below  main  91be03d  scanned 1d ago  outdated",
        "example/notifier     not scanned            main",
      ]
    `);
    expect(io.said).toEqual([]);
  });

  describe('when tests failed in the sandbox at the latest scan', () => {
    it('should note how many beside the scan', async () => {
      const list = { ...REPOSITORY_LIST, items: [FAILING_TESTS_REPOSITORY] };
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(list)),
      });

      await repoList(LIST, io);

      expect(io.printed[0]).toMatch(
        /scanned 2h ago {2}33 of 53 tests fail in the sandbox$/u,
      );
    });
  });

  describe('when the install of a repository runs its code', () => {
    it('should note it first on its line', async () => {
      const io = recordingIo({
        listRepositories: () =>
          Promise.resolve(
            answered({ items: [{ ...TRUSTED_REPOSITORY, outdated: true }] }),
          ),
      });

      await repoList(LIST, io);

      expect(io.printed).toEqual([
        'example/payments  71.4%  12 below  main  4f2a9c1  scanned 2h ago  ' +
          'trusted install, outdated',
      ]);
    });
  });

  describe('when no repository is connected', () => {
    it('should print nothing and end with 0', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered({ items: [] })),
      });

      await expect(repoList(LIST, io)).resolves.toBe(0);

      expect(io.printed).toEqual([]);
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the list of the contract as one document', async () => {
      const io = recordingIo(
        { listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)) },
        { json: true },
      );

      await expect(repoList(LIST, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(REPOSITORY_LIST)]);
    });
  });

  describe('when the service refuses', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const failure = {
        error: 'internal_error',
        message: 'The service failed.',
      } as const;
      const io = recordingIo({
        listRepositories: () => Promise.resolve(refused(500, failure)),
      });

      await expect(repoList(LIST, io)).resolves.toBe(1);

      expectRefusal(io, failure);
    });
  });
});
