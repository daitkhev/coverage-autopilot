import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceApi } from '#api/service-api';
import { useKeys } from '#hooks/use-keys';
import { ConnectDialogView } from '#screens/repositories/connect-dialog-view';
import { useConnectDialog } from '#screens/repositories/use-connect-dialog';
import {
  answered,
  type FakeSession,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import {
  ACCESS_REFUSED,
  NEVER_SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

const ADDRESS = 'https://github.com/example/notifier';
const CREATED = 201;

/** The dialog behind `a`, and the repositories it connected. */
function Connecting({
  session,
  connected,
}: {
  readonly session: FakeSession;
  readonly connected: string[];
}): ReactNode {
  const connect = useConnectDialog({
    session,
    onConnected: (repository) => {
      connected.push(repository.id);
    },
  });
  useKeys({ a: connect.open }, { active: connect.state === undefined });
  return connect.state === undefined ? (
    <Text>closed</Text>
  ) : (
    <ConnectDialogView
      state={connect.state}
      now={session.now()}
      onChange={connect.change}
      onConfirm={connect.confirm}
      onClose={connect.close}
    />
  );
}

function show(scripted: Partial<ServiceApi>) {
  const session = fakeSession({
    connectRepository: () =>
      Promise.resolve(answered(NEVER_SCANNED_REPOSITORY, CREATED)),
    ...scripted,
  });
  const connected: string[] = [];
  const terminal = render(
    <Connecting session={session} connected={connected} />,
  );
  const connects = (): number =>
    session.api.calls.filter((call) => call.method === 'connectRepository')
      .length;
  return { terminal, connected, connects };
}

function checked(check: AccessCheck): Partial<ServiceApi> {
  return { checkAccess: () => Promise.resolve(answered(check)) };
}

afterEach(cleanup);

describe('useConnectDialog', () => {
  it('should send nothing while no address was typed', async () => {
    const { terminal, connects } = show({});

    await press(terminal, 'a', KEYS.enter, ' ', KEYS.backspace, KEYS.enter);

    expect(connects()).toBe(0);
    expect(screenOf(terminal)).toContain('enter check');
  });

  describe('when access is refused', () => {
    it('should keep the answer of the tool and check again on enter', async () => {
      const { terminal, connects } = show(checked(ACCESS_REFUSED));

      await press(terminal, 'a', ADDRESS, KEYS.enter);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE TOOL SAID');
      await press(terminal, KEYS.enter);

      await expect.poll(connects, PATIENT).toBe(2);
    });

    it('should go back to the address once it is changed', async () => {
      const { terminal } = show(checked(ACCESS_REFUSED));

      await press(terminal, 'a', ADDRESS, KEYS.enter);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Access refused');
      await press(terminal, KEYS.backspace);

      expect(screenOf(terminal)).toContain('The HTTPS address');
      expect(screenOf(terminal)).toContain(
        'https://github.com/example/notifie█',
      );
    });

    it('should fall back to plain words where the tool said nothing', async () => {
      const quiet: AccessCheck = {
        ...ACCESS_REFUSED,
        steps: [
          {
            name: 'git_present',
            status: 'passed',
            message: 'Found git version 2.47.1.',
            toolOutput: null,
          },
          {
            name: 'gh_authenticated',
            status: 'failed',
            message: null,
            toolOutput: null,
          },
        ],
      };
      const { terminal } = show(checked(quiet));

      await press(terminal, 'a', ADDRESS, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Fix what failed, then press enter.');
      expect(screenOf(terminal)).toContain('✓ Found git version 2.47.1.');
      expect(screenOf(terminal)).not.toContain('THE TOOL SAID');
    });
  });

  describe('when the service refuses the address', () => {
    it('should say what to type', async () => {
      const { terminal } = show({
        connectRepository: () =>
          Promise.resolve(
            refused(400, { error: 'invalid_request', message: 'Not HTTPS.' }),
          ),
      });

      await press(terminal, 'a', 'example', KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Type the HTTPS address of a repository');
    });

    it('should ask to try again for a status it has no words for', async () => {
      const { terminal } = show({
        connectRepository: () =>
          Promise.resolve(
            refused(503, { error: 'internal_error', message: 'Try later.' }),
          ),
      });

      await press(terminal, 'a', ADDRESS, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Press enter to try again.');
    });
  });

  describe('when the request throws a fault', () => {
    it('should show the fault in the dialog', async () => {
      const { terminal } = show({
        connectRepository: () => Promise.reject(new TypeError('Broken.')),
      });

      await press(terminal, 'a', ADDRESS, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE CLIENT SAID');
    });
  });

  describe('when the dialog is closed while the checks run', () => {
    it('should drop their answer and open empty again', async () => {
      const checking = Promise.withResolvers<never>();
      const { terminal, connected } = show({
        checkAccess: () => checking.promise,
      });

      await press(terminal, 'a', ADDRESS, KEYS.enter);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Checking access');
      await press(terminal, KEYS.escape, 'a');
      checking.reject(new TypeError('Late.'));
      await press(terminal, 'x');

      expect(screenOf(terminal)).toContain('URL x█');
      expect(screenOf(terminal)).not.toContain('THE CLIENT SAID');
      expect(connected).toEqual([]);
    });
  });
});
