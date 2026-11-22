import { describe, expect, it } from 'vitest';

import type { Command } from '#commands/command';
import { repoAdd } from '#commands/repo-add';
import { answered, refused } from '#tests/support/fake-service-api';
import { recordingIo } from '#tests/support/sample-command-io';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';

const ADD: Command<'repo add'> = {
  name: 'repo add',
  url: SCANNED_REPOSITORY.url,
};

const CREATED = 201;

describe('repoAdd', () => {
  it('should connect the repository at the address and print it', async () => {
    const io = recordingIo({
      connectRepository: () =>
        Promise.resolve(answered(SCANNED_REPOSITORY, CREATED)),
    });

    await expect(repoAdd(ADD, io)).resolves.toBe(0);

    expect(io.session.api.calls).toEqual([
      {
        method: 'connectRepository',
        arguments: [{ url: 'https://github.com/example/payments' }],
      },
    ]);
    expect(io.printed).toMatchInlineSnapshot(`
      [
        "example/payments  71.4%  12 below  main  4f2a9c1  scanned 2h ago",
      ]
    `);
    expect(io.said).toEqual([]);
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the repository of the contract as one document', async () => {
      const io = recordingIo(
        {
          connectRepository: () =>
            Promise.resolve(answered(SCANNED_REPOSITORY, CREATED)),
        },
        { json: true },
      );

      await expect(repoAdd(ADD, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(SCANNED_REPOSITORY)]);
    });
  });

  describe('when the service refuses the address', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const io = recordingIo({
        connectRepository: () =>
          Promise.resolve(
            refused(400, {
              error: 'invalid_request',
              message: 'The address is not one of a repository.',
            }),
          ),
      });

      await expect(repoAdd(ADD, io)).resolves.toBe(1);

      expect(io.printed).toEqual([]);
      expect(io.said).toEqual([
        '{"error":"invalid_request","message":"The address is not one of a repository."}',
      ]);
    });
  });
});
