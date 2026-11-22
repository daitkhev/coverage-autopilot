import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { SnapshotFiles } from '@coverage-autopilot/api-contracts/snapshots';

import type { ServiceApi } from '#api/service-api';
import { ImprovementView } from '#screens/improvement/improvement-view';
import { nextFileOf } from '#screens/improvement/next-file';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { ACCEPTED_ATTEMPT } from '#tests/support/sample-attempts';
import {
  ABOVE_THRESHOLD_FILE,
  BELOW_THRESHOLD_FILE,
  IMPROVED_FILE,
  PAYMENTS_FILES,
} from '#tests/support/sample-files';
import {
  FRESH_ANSWER,
  NARROW,
  sampleFrame,
  SECTION,
} from '#tests/support/sample-frame';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import {
  ACCESS_PASSED,
  BUDGET_SETTINGS,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { screenLog } from '#tests/support/sample-work-log';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const { completed, failed, verifying, created } = IMPROVEMENT_BY_STATUS;

/** Two files below the threshold that wait for work, around others. */
const FILES: SnapshotFiles = {
  ...PAYMENTS_FILES,
  items: [
    { ...BELOW_THRESHOLD_FILE, path: 'src/a.ts' },
    IMPROVED_FILE,
    ABOVE_THRESHOLD_FILE,
    { ...BELOW_THRESHOLD_FILE, path: 'src/b.ts' },
    { ...BELOW_THRESHOLD_FILE, path: 'src/c.ts' },
  ],
};

/** A failure after the gate accepted a patch, so the patch can be read. */
const PUBLISH_FAILED: Improvement = {
  ...failed,
  attempts: [ACCEPTED_ATTEMPT],
  failure: { reason: 'publish_failed', message: 'The host refused it.' },
};

function viewing(improvement: Improvement, scripted: Partial<ServiceApi>) {
  const noted = screenLog();
  const session = fakeSession(scripted);
  const view = (
    <ImprovementView
      session={session}
      frame={sampleFrame(NARROW, SECTION.improvements)}
      improvement={improvement}
      repository={SCANNED_REPOSITORY}
      freshness={FRESH_ANSWER}
      onOpenPatch={noted.onOpenPatch}
      onOpenImprovement={noted.onOpenImprovement}
      onBack={noted.onBack}
    />
  );
  const tree = <>{drawnWith({ animation: false }, view)}</>;
  return {
    terminal: renderAt(tree, NARROW),
    log: noted.log,
    calls: session.api.calls,
  };
}

const READY: Partial<ServiceApi> = {
  listSnapshotFiles: () => Promise.resolve(answered(PAYMENTS_FILES)),
  getBudgetSettings: () => Promise.resolve(answered(BUDGET_SETTINGS)),
  checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
  startImprovement: () => Promise.resolve(answered(created, 202)),
};

afterEach(cleanup);

describe('nextFileOf', () => {
  it('should give the next file below the threshold that waits for work', () => {
    expect(nextFileOf(FILES, 'src/a.ts')?.path).toBe('src/b.ts');
  });

  it('should pass over files with work and files above the threshold', () => {
    expect(nextFileOf(FILES, IMPROVED_FILE.path)?.path).toBe('src/b.ts');
  });

  it('should go on from the first file after the last', () => {
    expect(nextFileOf(FILES, 'src/c.ts')?.path).toBe('src/a.ts');
  });

  it('should start at the first file when this one is not listed', () => {
    expect(nextFileOf(FILES, 'src/gone.ts')?.path).toBe('src/a.ts');
  });

  it('should give none when no other file waits', () => {
    const alone = { ...FILES, items: [{ ...BELOW_THRESHOLD_FILE }] };

    expect(nextFileOf(alone, BELOW_THRESHOLD_FILE.path)).toBeUndefined();
  });
});

describe('useNextFile', () => {
  it('should offer the start of the next file of the same snapshot on n', async () => {
    const { terminal, calls, log } = viewing(completed, READY);
    expect(frameOf(terminal)).toContain('n next file');

    await press(terminal, 'n');
    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Attempts    3');
    expect(frameOf(terminal)).toContain(`Improve ${BELOW_THRESHOLD_FILE.path}`);
    await press(terminal, KEYS.enter);

    await expect.poll(() => log, PATIENT).toEqual([`open ${created.id}`]);
    expect(calls[0]).toEqual({
      method: 'listSnapshotFiles',
      arguments: [completed.sourceSnapshotId],
    });
    const start = calls.find((call) => call.method === 'startImprovement');
    expect(start?.arguments[0]).toMatchObject({
      snapshotId: completed.sourceSnapshotId,
      filePath: BELOW_THRESHOLD_FILE.path,
    });
  });

  it('should say so when no other file waits for work', async () => {
    const { terminal } = viewing(completed, {
      listSnapshotFiles: () =>
        Promise.resolve(answered({ ...PAYMENTS_FILES, items: [] })),
    });

    await press(terminal, 'n');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('No other file below the threshold waits for work.');
  });

  it('should give the refusal of the service in one line', async () => {
    const { terminal } = viewing(completed, {
      listSnapshotFiles: () =>
        Promise.resolve(
          refused(404, { error: 'not_found', message: 'No snapshot.' }),
        ),
    });

    await press(terminal, 'n');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('could not be read: No snapshot.');
  });

  it('should say what went wrong when nothing answered', async () => {
    const { terminal } = viewing(completed, {
      listSnapshotFiles: () => Promise.reject(new Error('Gone.')),
    });

    await press(terminal, 'n');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('could not be read: Gone.');
  });

  it('should look for nothing while the work runs', async () => {
    const { terminal, calls } = viewing(verifying, READY);

    await press(terminal, 'n');

    expect(frameOf(terminal)).not.toContain('n next file');
    expect(calls).toEqual([]);
  });

  it('should keep the keys of a failure with a patch on one line', () => {
    const { terminal } = viewing(PUBLISH_FAILED, READY);

    const frame = frameOf(terminal);
    expect(frame).toContain('n next file');
    expect(frame).not.toContain('p patch');
    expect(widestLine(frame)).toBeLessThanOrEqual(NARROW.columns);
  });
});
