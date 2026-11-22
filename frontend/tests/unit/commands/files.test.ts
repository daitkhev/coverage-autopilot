import { describe, expect, it } from 'vitest';

import type { SnapshotFiles } from '@coverage-autopilot/api-contracts/snapshots';

import type { Command } from '#commands/command';
import { files } from '#commands/files';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  type IoSettings,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  BELOW_THRESHOLD_FILE,
  PAYMENTS_FILES,
} from '#tests/support/sample-files';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';

const FILES: Command<'files'> = {
  name: 'files',
  repository: 'example/payments',
  query: { below: 70, metric: 'lines' },
};

function filesIo(
  settings: IoSettings = {},
  list: SnapshotFiles = PAYMENTS_FILES,
): RecordingIo {
  return recordingIo(
    {
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      listSnapshotFiles: () => Promise.resolve(answered(list)),
    },
    settings,
  );
}

describe('files', () => {
  it('should ask for the files of the latest snapshot with the query', async () => {
    const io = filesIo();

    await expect(files(FILES, io)).resolves.toBe(0);

    expect(io.session.api.calls.at(-1)).toEqual({
      method: 'listSnapshotFiles',
      arguments: ['snapshot-payments-2', { below: 70, metric: 'lines' }],
    });
  });

  it('should print one aligned line for each file, in the order given', async () => {
    const io = filesIo();

    await files(FILES, io);

    expect(io.printed).toMatchInlineSnapshot(`
      [
        "src/billing/invoice.ts   41.2%  21/51  below",
        "src/billing/sum.ts       76.3%  29/38  below         ? REVIEW improvement-sum",
        "src/billing/currency.ts  91.7%  44/48  at or above",
        "src/billing/types.ts     0/0           no code",
        "src/legacy/parser.ts     N/A           not measured  has a syntax error",
        "src/api/schema.ts        N/A           not measured  is missing from the report",
        "src/api/webhook.ts       N/A           not measured  was reported without numbers",
      ]
    `);
    expect(io.said).toEqual([]);
  });

  describe('when the threshold is of another counter', () => {
    const BY_BRANCHES: SnapshotFiles = {
      ...PAYMENTS_FILES,
      threshold: { metric: 'branches', percentage: 80 },
      items: [BELOW_THRESHOLD_FILE],
    };

    it('should give each file the percentage of that counter', async () => {
      const io = filesIo({}, BY_BRANCHES);

      await files(FILES, io);

      expect(io.printed).toEqual(['src/billing/invoice.ts  25.0%  2/8  below']);
    });

    it('should give no percentage where the file has none of that code', async () => {
      const io = filesIo(
        {},
        {
          ...BY_BRANCHES,
          items: [
            {
              ...BELOW_THRESHOLD_FILE,
              coverage: {
                ...BELOW_THRESHOLD_FILE.coverage,
                branches: { covered: 0, total: 0, percentage: null },
              },
            },
          ],
        },
      );

      await files(FILES, io);

      expect(io.printed).toEqual(['src/billing/invoice.ts    0/0  below']);
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the files of the contract as one document', async () => {
      const io = filesIo({ json: true });

      await expect(files(FILES, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(PAYMENTS_FILES)]);
    });
  });

  describe('when the service refuses the files', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        listSnapshotFiles: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(files(FILES, io)).resolves.toBe(1);

      expectRefusal(io, NOT_FOUND);
    });
  });

  describe('when the repository was never scanned', () => {
    it('should ask for no files and end with 1', async () => {
      const io = filesIo();

      await expect(
        files({ ...FILES, repository: 'example/notifier' }, io),
      ).resolves.toBe(1);

      expect(io.session.api.calls).toHaveLength(1);
    });
  });
});
