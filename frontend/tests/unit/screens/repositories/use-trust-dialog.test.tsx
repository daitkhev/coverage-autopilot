import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { InstallMode } from '@coverage-autopilot/api-contracts/repositories';

import { useKeys } from '#hooks/use-keys';
import { TrustDialog } from '#screens/repositories/trust-dialog';
import { useTrustDialog } from '#screens/repositories/use-trust-dialog';
import {
  answered,
  type FakeSession,
  fakeSession,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import {
  SCANNED_REPOSITORY,
  TRUSTED_REPOSITORY,
} from '#tests/support/sample-repositories';

/** The dialog behind `i`, and the modes it saved. */
function Changing({
  session,
  saved,
}: {
  readonly session: FakeSession;
  readonly saved: InstallMode[];
}): ReactNode {
  const trust = useTrustDialog({
    session,
    onChanged: (repository) => {
      saved.push(repository.install.mode);
    },
  });
  useKeys(
    {
      i: () => {
        trust.open(SCANNED_REPOSITORY);
      },
    },
    { active: trust.parts === undefined },
  );
  return trust.parts === undefined ? (
    <Text>closed</Text>
  ) : (
    <TrustDialog {...trust.parts} />
  );
}

function show() {
  const session = fakeSession({
    changeInstallMode: () => Promise.resolve(answered(TRUSTED_REPOSITORY)),
  });
  const saved: InstallMode[] = [];
  const terminal = render(<Changing session={session} saved={saved} />);
  return { terminal, saved, calls: session.api.calls };
}

afterEach(cleanup);

describe('useTrustDialog', () => {
  it('should open the dialog for the repository it is given', async () => {
    const { terminal } = show();

    await press(terminal, 'i');

    expect(screenOf(terminal)).toContain('Install of example/payments');
  });

  it('should change how that repository is installed, then close', async () => {
    const { terminal, saved, calls } = show();

    await press(terminal, 'i', '3', KEYS.enter);

    await expect.poll(() => saved, PATIENT).toEqual(['trusted']);
    expect(calls).toEqual([
      {
        method: 'changeInstallMode',
        arguments: [SCANNED_REPOSITORY.id, { mode: 'trusted' }],
      },
    ]);
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('closed');
  });

  it('should close with no change on esc', async () => {
    const { terminal, saved, calls } = show();

    await press(terminal, 'i', KEYS.escape);

    await expect.poll(() => screenOf(terminal), PATIENT).toBe('closed');
    expect(saved).toEqual([]);
    expect(calls).toEqual([]);
  });
});
