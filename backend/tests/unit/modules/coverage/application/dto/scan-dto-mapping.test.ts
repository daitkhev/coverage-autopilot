import { describe, expect, it } from 'vitest';

import type { ScanOutcome } from '#coverage/application/commands/run-scan/scan-outcome';
import { scanDtoOf } from '#coverage/application/dto/scan-dto-mapping';
import { UnreadableScanOutcomeError } from '#coverage/application/errors/unreadable-scan-outcome.error';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import type { JobDocument } from '#ports/job-queue.port';
import { REPOSITORY_ID, SNAPSHOT_ID } from '#tests/support/coverage-snapshots';
import {
  ENDED_AT,
  endedScanJob,
  QUEUED_AT,
  queuedScanJob,
  runningScanJob,
  SCAN_ID,
  STARTED_AT,
} from '#tests/support/scan-jobs';

const STEPS = {
  steps: [
    { code: 'clone', status: 'passed' },
    { code: 'install', status: 'running' },
  ],
  updatedAt: Instant.parse(STARTED_AT),
} as const;

const MONOREPO = 'The repository holds more than one package (lerna.json).';

const FAULT = 'A scan job has the payload version 2, and this service reads 1.';

/** A scan that ended with the outcome its handler wrote. */
function endedWith(outcome: ScanOutcome) {
  return scanDtoOf(endedScanJob('completed', outcome), null);
}

describe('scanDtoOf', () => {
  it('should answer a job that waits as a queued scan', () => {
    expect(scanDtoOf(queuedScanJob(), null)).toEqual({
      id: SCAN_ID,
      repositoryId: RepositoryId.create(REPOSITORY_ID),
      status: 'queued',
      queuedAt: Instant.parse(QUEUED_AT),
      startedAt: null,
      finishedAt: null,
      progress: null,
      snapshotId: null,
      failure: null,
    });
  });

  it('should answer a leased job as a running scan with its steps', () => {
    expect(scanDtoOf(runningScanJob(), STEPS)).toMatchObject({
      status: 'running',
      startedAt: Instant.parse(STARTED_AT),
      finishedAt: null,
      progress: STEPS,
    });
  });

  it('should answer a cancelled job as a cancelled scan that finished', () => {
    expect(scanDtoOf(endedScanJob('cancelled'), null)).toMatchObject({
      status: 'cancelled',
      finishedAt: Instant.parse(ENDED_AT),
      snapshotId: null,
      failure: null,
    });
  });

  it('should answer a dead job as a scan that failed for good', () => {
    expect(scanDtoOf(endedScanJob('dead'), null)).toMatchObject({
      status: 'failed',
      finishedAt: Instant.parse(ENDED_AT),
      failure: {
        reason: 'retries_exhausted',
        message:
          'The scan stopped on an error on its last run, and nothing runs ' +
          'it again.',
      },
    });
  });

  describe('when the job completed', () => {
    it('should answer the snapshot it captured', () => {
      const scan = endedWith({
        version: 1,
        outcome: 'captured',
        snapshotId: SNAPSHOT_ID,
      });

      expect(scan).toMatchObject({
        status: 'completed',
        finishedAt: Instant.parse(ENDED_AT),
        snapshotId: SNAPSHOT_ID,
        failure: null,
      });
    });

    it.each<[string, ScanOutcome, unknown]>([
      [
        'an unsupported project with the sentence of the detector',
        {
          version: 1,
          outcome: 'unsupported_project',
          reason: 'monorepo',
          detail: MONOREPO,
        },
        { reason: 'unsupported_project', message: MONOREPO },
      ],
      [
        'an install that failed',
        { version: 1, outcome: 'install_failed', outputReference: 'out-1' },
        {
          reason: 'install_failed',
          message: 'The packages of the project could not be installed.',
        },
      ],
      [
        'a test run past its time limit',
        { version: 1, outcome: 'test_run_timed_out', outputReference: null },
        {
          reason: 'test_run_timed_out',
          message:
            'The tests ran past the time limit of a scan, so no file was ' +
            'measured.',
        },
      ],
      [
        'a test run that wrote no report',
        {
          version: 1,
          outcome: 'coverage_report_missing',
          outputReference: 'out-2',
        },
        {
          reason: 'coverage_report_missing',
          message:
            'The test runner ended and wrote no coverage report, so no ' +
            'file was measured. The output of the tests says why.',
        },
      ],
      [
        'a fault that ended it, with the sentence of the fault',
        {
          version: 1,
          outcome: 'failed',
          code: 'unknown_scan_payload',
          message: FAULT,
        },
        { reason: 'retries_exhausted', message: FAULT },
      ],
      [
        'a repository removed before it ran',
        { version: 1, outcome: 'repository_not_found' },
        {
          reason: 'retries_exhausted',
          message: 'The repository was removed before the scan ran.',
        },
      ],
    ])('should fail the scan for %s', (_, outcome, failure) => {
      expect(endedWith(outcome)).toMatchObject({
        status: 'failed',
        snapshotId: null,
        failure,
      });
    });
  });

  describe('when the outcome of a completed job cannot be read', () => {
    it.each<[string, JobDocument | null]>([
      ['no outcome', null],
      ['another version', { version: 2, outcome: 'captured' }],
      ['an outcome no scan writes', { version: 1, outcome: 'measured' }],
      ['a name of an outcome that is not text', { version: 1, outcome: 3 }],
      [
        'a field that is not text',
        { version: 1, outcome: 'captured', snapshotId: 7 },
      ],
    ])('should throw for %s', (_, outcome) => {
      expect(() => scanDtoOf(endedScanJob('completed', outcome), null)).toThrow(
        UnreadableScanOutcomeError,
      );
    });
  });
});
