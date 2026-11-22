import { cleanup, render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { RepositoryList } from '@coverage-autopilot/api-contracts/repositories';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { RepositoriesScreen } from '#screens/repositories/repositories-screen';
import {
  answered,
  type FakeSession,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import { IMPROVEMENT_LIST } from '#tests/support/sample-improvements';
import { LIVE_SIZE, sampleFrame } from '#tests/support/sample-lists-frame';
import {
  ACCESS_PASSED,
  NEVER_SCANNED_REPOSITORY,
  REPOSITORY_LIST,
  SCAN_BY_STATUS,
} from '#tests/support/sample-repositories';
import type { TerminalSize } from '#theme/widths';

const REPOSITORIES = 0;
const ACCEPTED = 202;
const SOCKET = '/tmp/service.sock';
const ADDRESS = 'https://github.com/example/notifier';

function sessionOf(
  scripted: Partial<ServiceApi> = {},
  list: RepositoryList = REPOSITORY_LIST,
): FakeSession {
  return fakeSession({
    listRepositories: () => Promise.resolve(answered(list)),
    getScan: () => Promise.resolve(answered(SCAN_BY_STATUS.running)),
    listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
    ...scripted,
  });
}

/** Shows the screen, and the repositories it was asked to open. */
function show(session: FakeSession, size: TerminalSize = LIVE_SIZE) {
  const opened: string[] = [];
  const terminal = render(
    <RepositoriesScreen
      session={session}
      frame={sampleFrame(size, REPOSITORIES)}
      onOpenFiles={(id) => {
        opened.push(id);
      }}
    />,
  );
  return { terminal, opened };
}

async function shown(session: FakeSession, size?: TerminalSize) {
  const screen = show(session, size);
  await expect
    .poll(() => screenOf(screen.terminal), PATIENT)
    .toContain('example/payments');
  return screen;
}

function callsOf(session: FakeSession, method: keyof ServiceApi) {
  return session.api.calls.filter((call) => call.method === method);
}

afterEach(cleanup);

describe('RepositoriesScreen', () => {
  it('should list the repositories with the step of a running scan', async () => {
    const { terminal } = await shown(sessionOf());

    expect(screenOf(terminal)).toContain('running the tests · 40s');
    expect(screenOf(terminal)).toContain('row 1 of 4');
  });

  it('should open the files of the chosen repository on enter', async () => {
    const { terminal, opened } = await shown(sessionOf());

    await press(terminal, KEYS.down, KEYS.enter, 'G', KEYS.enter);

    expect(opened).toEqual(['repository-gateway', 'repository-notifier']);
  });

  describe('when the details have the focus', () => {
    it('should not move the list, and still open on enter', async () => {
      const { terminal, opened } = await shown(sessionOf());

      await press(terminal, KEYS.tab, KEYS.down, KEYS.enter);

      expect(opened).toEqual(['repository-payments']);
    });
  });

  describe('when s is pressed', () => {
    it('should start one scan with one key, however often it is pressed', async () => {
      const starting = Promise.withResolvers<ServiceAnswer<Scan>>();
      const session = sessionOf({ startScan: () => starting.promise });
      const { terminal } = await shown(session);

      await press(terminal, 's', 's');
      expect(screenOf(terminal)).toContain('a scan waits for its turn');
      starting.resolve(answered(SCAN_BY_STATUS.queued, ACCEPTED));
      await press(terminal, 's');

      expect(callsOf(session, 'startScan')).toHaveLength(1);
      expect(screenOf(terminal)).toContain('2 scans running');
    });

    it('should start a new scan with a new key once the list shows none', async () => {
      const session = sessionOf({
        startScan: () =>
          Promise.resolve(answered(SCAN_BY_STATUS.queued, ACCEPTED)),
      });
      const { terminal } = await shown(session);

      await press(terminal, 's');
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('2 scans running');
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('1 scan running');
      await press(terminal, 's');

      const keys = callsOf(session, 'startScan').map((call) => call.arguments);
      expect(keys).toHaveLength(2);
      expect(keys[0]?.[0]).toBe('repository-payments');
      expect(keys[0]?.[1]).not.toBe(keys[1]?.[1]);
    });

    it('should start nothing for a repository whose scan runs', async () => {
      const session = sessionOf({
        startScan: () =>
          Promise.resolve(answered(SCAN_BY_STATUS.queued, ACCEPTED)),
      });
      const { terminal } = await shown(session);

      await press(terminal, KEYS.down, 's');

      expect(callsOf(session, 'startScan')).toHaveLength(0);
    });

    it('should say why the service refused to start it', async () => {
      const { terminal } = await shown(
        sessionOf({
          startScan: () =>
            Promise.resolve(
              refused(409, {
                error: 'work_already_requested',
                message: 'A scan of this repository runs.',
              }),
            ),
        }),
      );

      await press(terminal, 's');

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The scan was not started: A scan of this repository runs.');
    });

    it('should say what a fault of the request was', async () => {
      const { terminal } = await shown(
        sessionOf({
          startScan: () => Promise.reject(new ServiceUnreachableError(SOCKET)),
        }),
      );

      await press(terminal, 's');

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The scan was not started:');
    });
  });

  describe('when a is pressed', () => {
    it('should give every key to the dialog until it is closed', async () => {
      const { terminal, opened } = await shown(sessionOf());

      await press(terminal, 'a', 's', 'j', KEYS.down, KEYS.enter);
      expect(screenOf(terminal)).toContain('URL  sj█');
      expect(opened).toEqual([]);

      await press(terminal, KEYS.escape, KEYS.down);
      expect(screenOf(terminal)).not.toContain('Connect a repository');
      expect(screenOf(terminal)).toContain('row 2 of 4');
    });

    it('should connect the address, check access and say so', async () => {
      const session = sessionOf({
        connectRepository: () =>
          Promise.resolve(answered(NEVER_SCANNED_REPOSITORY, 201)),
        checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
      });
      const { terminal } = await shown(session);

      await press(terminal, 'a', ADDRESS, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('example/notifier is connected.');
      expect(screenOf(terminal)).not.toContain('Connect a repository');
      expect(callsOf(session, 'connectRepository')[0]?.arguments).toEqual([
        { url: ADDRESS },
      ]);
    });

    it('should start nothing on a second enter while the checks run', async () => {
      const checking = Promise.withResolvers<never>();
      const session = sessionOf({
        connectRepository: () =>
          Promise.resolve(answered(NEVER_SCANNED_REPOSITORY, 201)),
        checkAccess: () => checking.promise,
      });
      const { terminal } = await shown(session);

      await press(terminal, 'a', ADDRESS, KEYS.enter);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Checking access');
      await press(terminal, KEYS.enter, 'x');

      expect(callsOf(session, 'connectRepository')).toHaveLength(1);
      expect(screenOf(terminal)).toContain(`URL  ${ADDRESS}`);
      expect(screenOf(terminal)).not.toContain('enter check');
    });
  });

  describe('when no repository is connected', () => {
    it('should open and scan nothing', async () => {
      const session = sessionOf({}, { items: [] });
      const { terminal, opened } = show(session);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('No repositories yet. Press a to add one.');

      await press(terminal, KEYS.enter, 's');

      expect(opened).toEqual([]);
      expect(callsOf(session, 'startScan')).toHaveLength(0);
    });
  });

  describe('when the scan of a repository is no longer there', () => {
    it('should say a scan waits for its turn', async () => {
      const { terminal } = await shown(
        sessionOf({
          getScan: () =>
            Promise.resolve(
              refused(404, { error: 'not_found', message: 'Gone.' }),
            ),
        }),
      );

      expect(screenOf(terminal)).toContain('a scan waits for its turn');
    });
  });

  describe('when the service refuses the list', () => {
    it('should show what it refused with', async () => {
      const { terminal } = show(
        sessionOf({
          listRepositories: () =>
            Promise.resolve(
              refused(500, { error: 'internal_error', message: 'Lost.' }),
            ),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE SERVICE ANSWERED');
    });
  });

  describe('when the service does not answer', () => {
    it('should say so in the status line and show no fault', async () => {
      const { terminal } = show(
        sessionOf({
          listRepositories: () =>
            Promise.reject(new ServiceUnreachableError(SOCKET)),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('! no answer yet');
      expect(screenOf(terminal)).not.toContain('THE CLIENT SAID');
    });
  });

  describe('when a request throws a fault', () => {
    it('should show the fault', async () => {
      const { terminal } = show(
        sessionOf({
          listRepositories: () =>
            Promise.reject(new TypeError('The answer does not match.')),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE CLIENT SAID');
    });
  });

  describe('when the window has room for one panel', () => {
    it('should show the chosen repository in its place and back', async () => {
      const size = { ...LIVE_SIZE, columns: 80 };
      const { terminal } = await shown(sessionOf(), size);

      await press(terminal, KEYS.right);
      expect(screenOf(terminal)).toContain('COVERAGE');
      expect(screenOf(terminal)).not.toContain('example/gateway');

      await press(terminal, KEYS.left);
      expect(screenOf(terminal)).toContain('example/gateway');
    });
  });
});
