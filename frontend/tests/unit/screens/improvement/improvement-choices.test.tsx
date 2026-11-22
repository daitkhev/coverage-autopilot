import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { stepsOf } from '#screens/improvement/improvement-choices';
import type { OpenDialog } from '#screens/improvement/improvement-dialog';
import { ACCEPTED_ATTEMPT } from '#tests/support/sample-attempts';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import {
  NEVER_SCANNED_REPOSITORY,
  OUTDATED_REPOSITORY,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { screenLog } from '#tests/support/sample-work-log';

const { failed, completed } = IMPROVEMENT_BY_STATUS;

/** The checks could not run, after the gate accepted a patch. */
const CHECKS_FAILED: Improvement = {
  ...failed,
  attempts: [ACCEPTED_ATTEMPT],
  failure: { reason: 'verification_error', message: 'The runner broke.' },
};

function chosen(improvement: Improvement, repository = SCANNED_REPOSITORY) {
  const noted = screenLog();
  const opened: OpenDialog[] = [];
  const steps = stepsOf({
    improvement,
    repository,
    open: (dialog) => {
      opened.push(dialog);
    },
    onOpenPatch: noted.onOpenPatch,
    onBack: noted.onBack,
  });
  return { steps, choices: steps.choices, opened, log: noted.log };
}

describe('stepsOf', () => {
  it('should offer larger limits first when the budget ran out', () => {
    const { choices } = chosen(failed);

    expect(choices.map((choice) => choice.label)).toEqual([
      'Request it again with larger limits',
      'Go back',
    ]);
  });

  it('should ask for the file again from the latest snapshot, above its limits', () => {
    const { choices, opened } = chosen(failed, OUTDATED_REPOSITORY);

    choices[0]?.run();

    expect(opened).toEqual([
      {
        kind: 'start',
        target: {
          snapshotId: 'snapshot-billing-api-1',
          filePath: failed.targetFile,
          earlier: {
            attempts: 3,
            tokens: null,
            minutes: 30,
            mode: 'automatic',
          },
        },
      },
    ]);
  });

  it('should ask from the snapshot of the work when the repository has none', () => {
    const { choices, opened } = chosen(failed, NEVER_SCANNED_REPOSITORY);

    choices[0]?.run();

    expect(opened[0]).toMatchObject({
      target: { snapshotId: failed.sourceSnapshotId },
    });
  });

  it('should not offer larger limits for a failure they do not help', () => {
    const { choices, log } = chosen(CHECKS_FAILED);

    choices[0]?.run();

    expect(choices.map((choice) => choice.label)).toEqual([
      'Show the patch of attempt 1',
      'Go back',
    ]);
    expect(log).toEqual([`patch ${failed.id}`]);
  });

  it('should offer nothing for work that did not fail', () => {
    expect(chosen(completed).choices).toEqual([]);
  });

  it('should give the patch its key, also of work that did not fail', () => {
    const { steps, log } = chosen(completed);

    steps.patch[0]?.run();

    expect(steps.patch.map(({ key }) => key)).toEqual(['p']);
    expect(steps.patch[0]?.command.title).toBe('Show the patch of attempt 2');
    expect(steps.again).toEqual([]);
    expect(log).toEqual([`patch ${completed.id}`]);
  });

  it('should go back on esc, as the last of the steps does', () => {
    const { steps, choices, log } = chosen(failed);

    choices.at(-1)?.run();

    expect(steps.back.key).toBe('esc');
    expect(log).toEqual(['back']);
  });
});
