import { describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { Command } from '#commands/command';
import { repoTrust } from '#commands/repo-trust';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  type IoSettings,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  REPOSITORY_LIST,
  SCANNED_REPOSITORY,
  TRUSTED_REPOSITORY,
} from '#tests/support/sample-repositories';

const TRUST: Command<'repo trust'> = {
  name: 'repo trust',
  repository: 'example/payments',
  mode: 'trusted',
};

const NOT_A_MODE = {
  error: 'invalid_request',
  message: 'mode: Invalid option: expected one of "sandboxed"|"trusted"',
} as const;

function trustIo(changed: Repository, settings: IoSettings = {}): RecordingIo {
  return recordingIo(
    {
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      changeInstallMode: () => Promise.resolve(answered(changed)),
    },
    settings,
  );
}

describe('repoTrust', () => {
  it('should give the repository it found by its name a mode of its own', async () => {
    const io = trustIo(TRUSTED_REPOSITORY);

    await expect(repoTrust(TRUST, io)).resolves.toBe(0);

    expect(io.session.api.calls.at(-1)).toEqual({
      method: 'changeInstallMode',
      arguments: ['repository-payments', { mode: 'trusted' }],
    });
    expect(io.printed).toEqual(['example/payments  install trusted  own']);
    expect(io.said).toEqual([]);
  });

  describe('with default in place of a mode', () => {
    it('should give it the mode of the service back', async () => {
      const io = trustIo(SCANNED_REPOSITORY);

      await expect(repoTrust({ ...TRUST, mode: null }, io)).resolves.toBe(0);

      expect(io.session.api.calls.at(-1)?.arguments).toEqual([
        'repository-payments',
        { mode: null },
      ]);
      expect(io.printed).toEqual([
        'example/payments  install sandboxed  default',
      ]);
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the repository of the contract as one document', async () => {
      const io = trustIo(TRUSTED_REPOSITORY, { json: true });

      await repoTrust(TRUST, io);

      expect(io.printed).toEqual([JSON.stringify(TRUSTED_REPOSITORY)]);
    });
  });

  describe('when the service refuses the mode', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        changeInstallMode: () => Promise.resolve(refused(400, NOT_A_MODE)),
      });

      await expect(repoTrust(TRUST, io)).resolves.toBe(1);

      expectRefusal(io, NOT_A_MODE);
    });
  });

  describe('when no repository of the name is connected', () => {
    it('should change nothing and end with 1', async () => {
      const io = trustIo(TRUSTED_REPOSITORY);

      await expect(
        repoTrust({ ...TRUST, repository: 'acme/gadgets' }, io),
      ).resolves.toBe(1);

      expect(io.session.api.calls.map(({ method }) => method)).toEqual([
        'listRepositories',
      ]);
    });
  });
});
