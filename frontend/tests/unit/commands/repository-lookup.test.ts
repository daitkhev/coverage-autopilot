import { describe, expect, it } from 'vitest';

import {
  findLatestSnapshot,
  findRepository,
} from '#commands/repository-lookup';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  PAYMENTS_SNAPSHOT,
  REPOSITORY_LIST,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

function listedIo(): RecordingIo {
  return recordingIo({
    listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
  });
}

const UNKNOWN =
  'No repository acme/widgets is connected; ' +
  'connect it with coverage-autopilot repo add <url>.';

describe('findRepository', () => {
  it('should find the repository by owner/name', async () => {
    const io = listedIo();

    await expect(findRepository('example/payments', io)).resolves.toEqual(
      SCANNED_REPOSITORY,
    );
    expect(io.said).toEqual([]);
  });

  describe('when no repository has the name', () => {
    it('should say so in one sentence and find nothing', async () => {
      const io = listedIo();

      await expect(findRepository('acme/widgets', io)).resolves.toBeUndefined();
      expect(io.said).toEqual([UNKNOWN]);
    });
  });

  describe('when the service refuses the list', () => {
    it('should say the refusal and find nothing', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(
        findRepository('example/payments', io),
      ).resolves.toBeUndefined();
      expect(io.said).toEqual([JSON.stringify(NOT_FOUND)]);
    });
  });
});

describe('findLatestSnapshot', () => {
  it('should find the latest snapshot of the repository', async () => {
    await expect(
      findLatestSnapshot('example/payments', listedIo()),
    ).resolves.toEqual(PAYMENTS_SNAPSHOT);
  });

  describe('when the repository was never scanned', () => {
    it('should say how to scan it and find nothing', async () => {
      const io = listedIo();

      await expect(
        findLatestSnapshot('example/notifier', io),
      ).resolves.toBeUndefined();
      expect(io.said).toEqual([
        'example/notifier has no snapshot yet; ' +
          'scan it first with coverage-autopilot scan example/notifier.',
      ]);
    });
  });

  describe('when no repository has the name', () => {
    it('should say only that', async () => {
      const io = listedIo();

      await expect(
        findLatestSnapshot('acme/widgets', io),
      ).resolves.toBeUndefined();
      expect(io.said).toEqual([UNKNOWN]);
    });
  });
});
