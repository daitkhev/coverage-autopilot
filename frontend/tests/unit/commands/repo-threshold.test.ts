import { describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { Command } from '#commands/command';
import { repoThreshold } from '#commands/repo-threshold';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  type IoSettings,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  OWN_THRESHOLD_REPOSITORY,
  REPOSITORY_LIST,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

const OWN: Command<'repo threshold'> = {
  name: 'repo threshold',
  repository: 'example/payments',
  percentage: 90,
};

const OUT_OF_RANGE = {
  error: 'invalid_request',
  message: 'percentage: Too big: expected number to be <=100',
} as const;

function thresholdIo(
  changed: Repository,
  settings: IoSettings = {},
): RecordingIo {
  return recordingIo(
    {
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      changeThreshold: () => Promise.resolve(answered(changed)),
    },
    settings,
  );
}

describe('repoThreshold', () => {
  it('should give the repository it found by its name a percent of its own', async () => {
    const io = thresholdIo(OWN_THRESHOLD_REPOSITORY);

    await expect(repoThreshold(OWN, io)).resolves.toBe(0);

    expect(io.session.api.calls.at(-1)).toEqual({
      method: 'changeThreshold',
      arguments: ['repository-payments', { percentage: 90 }],
    });
    expect(io.printed).toEqual([
      'example/payments  threshold 90.0% of lines  own',
    ]);
    expect(io.said).toEqual([]);
  });

  describe('with default in place of a percent', () => {
    it('should give it the threshold of the service back', async () => {
      const io = thresholdIo(SCANNED_REPOSITORY);

      await expect(
        repoThreshold({ ...OWN, percentage: null }, io),
      ).resolves.toBe(0);

      expect(io.session.api.calls.at(-1)?.arguments).toEqual([
        'repository-payments',
        { percentage: null },
      ]);
      expect(io.printed).toEqual([
        'example/payments  threshold 80.0% of lines  default',
      ]);
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the repository of the contract as one document', async () => {
      const io = thresholdIo(OWN_THRESHOLD_REPOSITORY, { json: true });

      await repoThreshold(OWN, io);

      expect(io.printed).toEqual([JSON.stringify(OWN_THRESHOLD_REPOSITORY)]);
    });
  });

  describe('when the service refuses the percent', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        changeThreshold: () => Promise.resolve(refused(400, OUT_OF_RANGE)),
      });

      await expect(
        repoThreshold({ ...OWN, percentage: 101 }, io),
      ).resolves.toBe(1);

      expectRefusal(io, OUT_OF_RANGE);
    });
  });

  describe('when no repository of the name is connected', () => {
    it('should change nothing and end with 1', async () => {
      const io = thresholdIo(OWN_THRESHOLD_REPOSITORY);

      await expect(
        repoThreshold({ ...OWN, repository: 'acme/gadgets' }, io),
      ).resolves.toBe(1);

      expect(io.session.api.calls.map(({ method }) => method)).toEqual([
        'listRepositories',
      ]);
    });
  });
});
