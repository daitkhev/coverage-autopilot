import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import {
  dialogFacts,
  dialogHints,
  ImprovementDialog,
  type OpenDialog,
} from '#screens/improvement/improvement-dialog';
import { answered, fakeSession } from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { NARROW } from '#tests/support/sample-frame';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import {
  ACCESS_PASSED,
  BUDGET_SETTINGS,
  PAYMENTS_SNAPSHOT,
} from '#tests/support/sample-repositories';
import { drawnWith } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const { failed, created } = IMPROVEMENT_BY_STATUS;

const AGAIN: OpenDialog = {
  kind: 'start',
  target: {
    snapshotId: PAYMENTS_SNAPSHOT.id,
    filePath: failed.targetFile,
    earlier: { ...failed.budget, mode: failed.mode },
  },
};

const SERVICE: Partial<ServiceApi> = {
  getBudgetSettings: () => Promise.resolve(answered(BUDGET_SETTINGS)),
  checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
  startImprovement: () => Promise.resolve(answered(created, 202)),
  cancelImprovement: () => Promise.resolve(answered(failed, 202)),
};

function opened(dialog: OpenDialog) {
  const log: string[] = [];
  const session = fakeSession(SERVICE);
  const tree = (
    <ImprovementDialog
      dialog={dialog}
      session={session}
      improvement={failed}
      onStarted={(improvementId) => {
        log.push(`started ${improvementId}`);
      }}
      onClose={() => {
        log.push('closed');
      }}
    />
  );
  const terminal = renderAt(
    <>{drawnWith({ animation: false }, tree)}</>,
    NARROW,
  );
  return { terminal, log, calls: session.api.calls };
}

afterEach(cleanup);

describe('ImprovementDialog', () => {
  describe('when it asks before a cancel', () => {
    it('should cancel this improvement once confirmed', async () => {
      const { terminal, calls, log } = opened({ kind: 'cancel' });

      expect(frameOf(terminal)).toContain('Cancel this improvement?');
      await press(terminal, '2', KEYS.enter);

      await expect.poll(() => log, PATIENT).toEqual(['closed']);
      expect(calls).toEqual([
        { method: 'cancelImprovement', arguments: [failed.id] },
      ]);
    });
  });

  describe('when it starts more work', () => {
    it('should start one step above the earlier limits', async () => {
      const { terminal } = opened(AGAIN);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Attempts    4');
      expect(frameOf(terminal)).toContain(`Improve ${failed.targetFile}`);
      expect(frameOf(terminal)).toContain('Time        35 min');
      expect(frameOf(terminal)).toContain('● Open the pull request without');
    });

    it('should start it in the repository of this work and say so', async () => {
      const { terminal, calls, log } = opened(AGAIN);
      await expect.poll(() => frameOf(terminal), PATIENT).toContain('Attempts');

      await press(terminal, KEYS.enter);

      await expect.poll(() => log, PATIENT).toEqual([`started ${created.id}`]);
      expect(calls.map((call) => call.arguments[0])).toContainEqual(
        failed.repositoryId,
      );
    });

    it('should start at the defaults without earlier limits', async () => {
      const { terminal } = opened({
        kind: 'start',
        target: { snapshotId: PAYMENTS_SNAPSHOT.id, filePath: 'src/a.ts' },
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Attempts    3');
    });
  });
});

describe('dialogHints', () => {
  it('should name the key that closes each dialog', () => {
    expect(dialogHints({ kind: 'cancel' })).toEqual([
      { key: 'esc', label: 'keep' },
    ]);
    expect(dialogHints(AGAIN)).toEqual([{ key: 'esc', label: 'close' }]);
  });
});

describe('dialogFacts', () => {
  it('should say what the open dialog is about', () => {
    expect(dialogFacts({ kind: 'cancel' })).toEqual([
      'waiting for your answer',
    ]);
    expect(dialogFacts(AGAIN)).toEqual([`limits for ${failed.targetFile}`]);
  });
});
