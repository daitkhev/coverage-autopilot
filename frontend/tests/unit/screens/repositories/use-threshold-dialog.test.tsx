import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useKeys } from '#hooks/use-keys';
import { ThresholdDialog } from '#screens/repositories/threshold-dialog';
import { useThresholdDialog } from '#screens/repositories/use-threshold-dialog';
import {
  answered,
  type FakeSession,
  fakeSession,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import {
  OWN_THRESHOLD_REPOSITORY,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

/** The dialog behind `t`, and the thresholds it saved. */
function Changing({
  session,
  saved,
}: {
  readonly session: FakeSession;
  readonly saved: number[];
}): ReactNode {
  const threshold = useThresholdDialog({
    session,
    onChanged: (repository) => {
      saved.push(repository.threshold.percentage);
    },
  });
  useKeys(
    {
      t: () => {
        threshold.open(SCANNED_REPOSITORY);
      },
    },
    { active: threshold.parts === undefined },
  );
  return threshold.parts === undefined ? (
    <Text>closed</Text>
  ) : (
    <ThresholdDialog {...threshold.parts} />
  );
}

function show() {
  const session = fakeSession({
    changeThreshold: () => Promise.resolve(answered(OWN_THRESHOLD_REPOSITORY)),
  });
  const saved: number[] = [];
  const terminal = render(<Changing session={session} saved={saved} />);
  return { terminal, saved, calls: session.api.calls };
}

afterEach(cleanup);

describe('useThresholdDialog', () => {
  it('should open the dialog for the repository it is given', async () => {
    const { terminal } = show();

    await press(terminal, 't');

    expect(screenOf(terminal)).toContain('Threshold of example/payments');
  });

  it('should change the threshold of that repository, then close', async () => {
    const { terminal, saved, calls } = show();

    await press(terminal, 't', '9', '0', KEYS.enter);

    await expect.poll(() => saved, PATIENT).toEqual([90]);
    expect(calls).toEqual([
      {
        method: 'changeThreshold',
        arguments: [SCANNED_REPOSITORY.id, { percentage: 90 }],
      },
    ]);
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('closed');
  });

  it('should close with no change on esc', async () => {
    const { terminal, saved, calls } = show();

    await press(terminal, 't', KEYS.escape);

    await expect.poll(() => screenOf(terminal), PATIENT).toBe('closed');
    expect(saved).toEqual([]);
    expect(calls).toEqual([]);
  });
});
