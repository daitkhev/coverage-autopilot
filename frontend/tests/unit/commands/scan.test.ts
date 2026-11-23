import { describe, expect, it } from 'vitest';

import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { ServiceAnswer } from '#api/service-api';
import type { Command } from '#commands/command';
import { scan } from '#commands/scan';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  inTurn,
  type IoSettings,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  FAILING_TESTS,
  PAYMENTS_SNAPSHOTS,
  REPOSITORY_LIST,
  SCAN_BY_STATUS,
} from '#tests/support/sample-repositories';

const SCAN: Command<'scan'> = {
  name: 'scan',
  repository: 'example/payments',
  wait: false,
};
const WAIT: Command<'scan'> = { ...SCAN, wait: true };
const ACCEPTED = 202;

const QUEUED = SCAN_BY_STATUS.queued;

/** The queued scan as it moves: the same id, a later status. */
function later(status: Scan): Scan {
  return { ...status, id: QUEUED.id, repositoryId: QUEUED.repositoryId };
}

const STARTING = later({ ...SCAN_BY_STATUS.running, progress: null });
const TESTING = later(SCAN_BY_STATUS.running);
const READING = later({
  ...SCAN_BY_STATUS.running,
  progress: {
    steps: [
      { code: 'test_run', status: 'passed' },
      { code: 'read_report', status: 'running' },
    ],
    updatedAt: '2026-11-21T14:05:00.000Z',
  },
});
const COMPLETED = later(SCAN_BY_STATUS.completed);

function scanIo(
  answers: readonly ServiceAnswer<Scan>[],
  settings: IoSettings = {},
): RecordingIo {
  const [first = answered(COMPLETED), ...rest] = answers;
  return recordingIo(
    {
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      startScan: () => Promise.resolve(answered(QUEUED, ACCEPTED)),
      getScan: inTurn(first, ...rest),
      listSnapshots: () => Promise.resolve(answered(PAYMENTS_SNAPSHOTS)),
    },
    settings,
  );
}

describe('scan', () => {
  it('should queue a scan of the repository with a new key and print it', async () => {
    const io = scanIo([]);

    await expect(scan(SCAN, io)).resolves.toBe(0);

    expect(io.session.api.calls.at(-1)).toEqual({
      method: 'startScan',
      arguments: ['repository-payments', expect.any(String)],
    });
    expect(io.printed).toEqual(['○ WAIT  scan-payments-3']);
    expect(io.said).toEqual([]);
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the scan of the contract as one document', async () => {
      const io = scanIo([], { json: true });

      await expect(scan(SCAN, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(QUEUED)]);
    });
  });

  describe('when the service refuses the scan', () => {
    it.each([SCAN, WAIT])(
      'should say the refusal and end with 1, waiting or not',
      async (command) => {
        const io = recordingIo({
          listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
          startScan: () => Promise.resolve(refused(404, NOT_FOUND)),
        });

        await expect(scan(command, io)).resolves.toBe(1);

        expectRefusal(io, NOT_FOUND);
      },
    );
  });

  describe('when no repository has the name', () => {
    it('should queue nothing and end with 1', async () => {
      const io = scanIo([]);

      await expect(
        scan({ ...SCAN, repository: 'acme/widgets' }, io),
      ).resolves.toBe(1);

      expect(io.session.api.calls).toHaveLength(1);
    });
  });

  describe('when it waits and the scan completes', () => {
    it('should say each step once and print the totals of its snapshot', async () => {
      const io = scanIo([
        answered(STARTING),
        answered(TESTING),
        answered(TESTING),
        answered(READING),
        answered(COMPLETED),
      ]);

      await expect(scan(WAIT, io)).resolves.toBe(0);

      expect(io.said).toEqual([
        'queued',
        'running',
        'running      test_run',
        'running      read_report',
      ]);
      expect(io.printed).toMatchInlineSnapshot(`
        [
          "lines       71.4%  1142/1600",
          "branches    61.3%  380/620",
          "functions   80.0%  240/300",
          "statements  71.3%  1212/1700",
        ]
      `);
      expect(io.pauses).toEqual([1000, 1000, 1000, 1000, 1000]);
    });

    it('should say how many tests failed in the sandbox after the totals', async () => {
      const snapshots = {
        ...PAYMENTS_SNAPSHOTS,
        items: PAYMENTS_SNAPSHOTS.items.map((item) => ({
          ...item,
          tests: FAILING_TESTS,
        })),
      };
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        startScan: () => Promise.resolve(answered(QUEUED, ACCEPTED)),
        getScan: inTurn(answered(COMPLETED)),
        listSnapshots: () => Promise.resolve(answered(snapshots)),
      });

      await expect(scan(WAIT, io)).resolves.toBe(0);

      expect(io.printed.at(-1)).toBe('33 of 53 tests fail in the sandbox');
    });

    it('should print the snapshot of the contract with --json', async () => {
      const io = scanIo([answered(COMPLETED)], { json: true });

      await expect(scan(WAIT, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(PAYMENTS_SNAPSHOTS.items[0])]);
    });

    it('should end with 1 when the snapshots are refused', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        startScan: () => Promise.resolve(answered(COMPLETED)),
        listSnapshots: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(scan(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual([JSON.stringify(NOT_FOUND)]);
    });

    it('should fail as a fault when its snapshot is not listed', async () => {
      const io = scanIo([
        answered({ ...COMPLETED, snapshotId: 'snapshot-gone' }),
      ]);

      await expect(scan(WAIT, io)).rejects.toThrow(
        'The scan scan-payments-3 completed, and its repository lists no snapshot snapshot-gone.',
      );
    });
  });

  describe('when it waits and the scan fails', () => {
    it('should say the failure in the shape of a refusal and end with 1', async () => {
      const io = scanIo([answered(later(SCAN_BY_STATUS.failed))]);

      await expect(scan(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual([
        'queued',
        '{"error":"install_failed","message":"The packages of the project could not be installed."}',
      ]);
      expect(io.printed).toEqual([]);
    });

    it('should pass on how to trust a project it would not install', async () => {
      const message =
        'yarn.lock takes a package from a git repository. Trust the ' +
        'repository to install it as its developers do: repo trust ' +
        'example/payments trusted.';
      const failure = { reason: 'unsupported_project', message } as const;
      const io = scanIo([
        answered({ ...later(SCAN_BY_STATUS.failed), failure }),
      ]);

      await expect(scan(WAIT, io)).resolves.toBe(1);

      expect(io.said.at(-1)).toBe(
        JSON.stringify({ error: 'unsupported_project', message }),
      );
    });

    it('should say the one word when the service gave no reason', async () => {
      const io = scanIo([
        answered({ ...later(SCAN_BY_STATUS.failed), failure: null }),
      ]);

      await expect(scan(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual(['queued', 'failed']);
    });
  });

  describe('when it waits and the scan is cancelled', () => {
    it('should say it and end with 1', async () => {
      const io = scanIo([answered(later(SCAN_BY_STATUS.cancelled))]);

      await expect(scan(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual(['queued', 'cancelled']);
      expect(io.printed).toEqual([]);
    });
  });

  describe('when the service refuses a question on the way', () => {
    it('should say the refusal and end with 1', async () => {
      const io = scanIo([answered(TESTING), refused(404, NOT_FOUND)]);

      await expect(scan(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual([
        'queued',
        'running      test_run',
        JSON.stringify(NOT_FOUND),
      ]);
    });
  });
});
