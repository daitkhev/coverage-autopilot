import { describe, expect, it } from 'vitest';

import { attemptSchema } from '@coverage-autopilot/api-contracts/attempts';
import { healthSchema } from '@coverage-autopilot/api-contracts/health';
import {
  budgetSettingsSchema,
  improvementListSchema,
  improvementPatchSchema,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  accessCheckSchema,
  repositoryListSchema,
  repositorySchema,
} from '@coverage-autopilot/api-contracts/repositories';
import { scanSchema } from '@coverage-autopilot/api-contracts/scans';
import {
  fileCoverageSchema,
  snapshotFilesSchema,
  snapshotListSchema,
} from '@coverage-autopilot/api-contracts/snapshots';

import {
  ACCEPTED_ATTEMPT,
  OPEN_ATTEMPT,
  REJECTED_ATTEMPT,
} from '#tests/support/sample-attempts';
import {
  ABOVE_THRESHOLD_FILE,
  BELOW_THRESHOLD_FILE,
  IMPROVED_FILE,
  NO_CODE_FILE,
  PAYMENTS_FILES,
  UNMEASURED_FILES,
} from '#tests/support/sample-files';
import {
  IMPROVEMENT_BY_STATUS,
  IMPROVEMENT_LIST,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import {
  ACCESS_PASSED,
  ACCESS_REFUSED,
  BUDGET_SETTINGS,
  BUSY_HEALTH,
  IDLE_HEALTH,
  NEVER_SCANNED_REPOSITORY,
  OTHER_VERSION_HEALTH,
  OUTDATED_REPOSITORY,
  PAYMENTS_SNAPSHOTS,
  REPORT_MISSING_SCAN,
  REPOSITORY_LIST,
  SCAN_BY_STATUS,
  SCANNED_REPOSITORY,
  SCANNING_REPOSITORY,
} from '#tests/support/sample-repositories';

/** A schema of the contracts, as the one reader of the client takes it. */
type Schema = Parameters<typeof parseAs>[0];

type Sample = readonly [name: string, schema: Schema, value: unknown];

function each(
  kind: string,
  schema: Schema,
  samples: Readonly<Record<string, unknown>>,
): Sample[] {
  return Object.entries(samples).map(([key, value]) => [
    `the ${kind} ${key}`,
    schema,
    value,
  ]);
}

const SAMPLES: readonly Sample[] = [
  ['the scanned repository', repositorySchema, SCANNED_REPOSITORY],
  ['the repository never scanned', repositorySchema, NEVER_SCANNED_REPOSITORY],
  ['the repository being scanned', repositorySchema, SCANNING_REPOSITORY],
  ['the outdated repository', repositorySchema, OUTDATED_REPOSITORY],
  ['the list of repositories', repositoryListSchema, REPOSITORY_LIST],
  ['the snapshots', snapshotListSchema, PAYMENTS_SNAPSHOTS],
  ['the access check that passed', accessCheckSchema, ACCESS_PASSED],
  ['the access check refused', accessCheckSchema, ACCESS_REFUSED],
  ...each('scan', scanSchema, SCAN_BY_STATUS),
  ['the scan with no report', scanSchema, REPORT_MISSING_SCAN],
  ['the health of an idle service', healthSchema, IDLE_HEALTH],
  ['the health of a busy service', healthSchema, BUSY_HEALTH],
  ['the health of another version', healthSchema, OTHER_VERSION_HEALTH],
  ['the budget settings', budgetSettingsSchema, BUDGET_SETTINGS],
  ['the file below', fileCoverageSchema, BELOW_THRESHOLD_FILE],
  ['the file above', fileCoverageSchema, ABOVE_THRESHOLD_FILE],
  ['the file with no code', fileCoverageSchema, NO_CODE_FILE],
  ['the improved file', fileCoverageSchema, IMPROVED_FILE],
  ...each('file unmeasured for', fileCoverageSchema, UNMEASURED_FILES),
  ['the files of a snapshot', snapshotFilesSchema, PAYMENTS_FILES],
  ['the rejected attempt', attemptSchema, REJECTED_ATTEMPT],
  ['the open attempt', attemptSchema, OPEN_ATTEMPT],
  ['the accepted attempt', attemptSchema, ACCEPTED_ATTEMPT],
  ...each('improvement', improvementSchema, IMPROVEMENT_BY_STATUS),
  ['the list of improvements', improvementListSchema, IMPROVEMENT_LIST],
  ['the patch', improvementPatchSchema, PATCH_AWAITING_APPROVAL],
];

describe('the samples', () => {
  it.each(SAMPLES)('should read %s with its schema', (_, schema, sample) => {
    expect(parseAs(schema, sample)).toEqual(sample);
  });

  it.each(Object.entries(SCAN_BY_STATUS))(
    'should file the scan %s under its status',
    (status, scan) => {
      expect(scan.status).toBe(status);
    },
  );

  it.each(Object.entries(IMPROVEMENT_BY_STATUS))(
    'should file the improvement %s under its status',
    (status, improvement) => {
      expect(improvement.status).toBe(status);
    },
  );

  it.each(Object.entries(UNMEASURED_FILES))(
    'should file the file unmeasured for %s under its reason',
    (reason, file) => {
      expect(file.reason).toBe(reason);
    },
  );

  it('should point the improved file at the improvement it names', () => {
    const awaiting = IMPROVEMENT_BY_STATUS.awaiting_approval;

    expect(IMPROVED_FILE.latestImprovement).toEqual({
      id: awaiting.id,
      status: awaiting.status,
    });
    expect(awaiting.targetFile).toBe(IMPROVED_FILE.path);
  });

  it('should give the patch the hash of the attempt that waits', () => {
    const [attempt] = IMPROVEMENT_BY_STATUS.awaiting_approval.attempts;

    expect(attempt?.patchHash).toBe(PATCH_AWAITING_APPROVAL.patchHash);
    expect(attempt?.number).toBe(PATCH_AWAITING_APPROVAL.attemptNumber);
  });

  it('should point the repository being scanned at its running scan', () => {
    expect(SCANNING_REPOSITORY.activeScanId).toBe(SCAN_BY_STATUS.running.id);
    expect(SCAN_BY_STATUS.running.repositoryId).toBe(SCANNING_REPOSITORY.id);
  });
});
