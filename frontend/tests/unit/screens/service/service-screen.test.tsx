import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  Health,
  StopServiceResult,
} from '@coverage-autopilot/api-contracts/health';

import type { ServiceAnswer } from '#api/service-api';
import { ServiceTimeoutError } from '#api/service-timeout-error';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { ServiceScreen } from '#screens/service/service-screen';
import {
  answered,
  type FakeSession,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import {
  NARROW,
  sampleFrame,
  SECTION,
  WIDE,
} from '#tests/support/sample-frame';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';
import { renderAt } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

const ACCEPTED = 202;
const SOCKET = '/tmp/service.sock';

function show(session: FakeSession, size: TerminalSize = WIDE) {
  return renderAt(
    <ServiceScreen
      session={session}
      frame={sampleFrame(size, SECTION.service)}
    />,
    size,
  );
}

function healthy(health: Health = IDLE_HEALTH): () => Promise<Health> {
  return () => Promise.resolve(health);
}

function stops(session: FakeSession): number {
  return session.api.calls.filter((call) => call.method === 'stopService')
    .length;
}

/** Shows the screen and waits for the first health to be drawn. */
async function shown(session: FakeSession) {
  const terminal = show(session);
  await expect
    .poll(() => screenOf(terminal), PATIENT)
    .toContain('Everything is in order');
  return terminal;
}

afterEach(cleanup);

describe('ServiceScreen', () => {
  it('should show the health the service answered', async () => {
    const terminal = await shown(fakeSession({ health: healthy() }));

    expect(screenOf(terminal)).toContain('● Everything is in order');
    expect(screenOf(terminal)).toContain('updated 0s ago');
  });

  describe('when r is pressed', () => {
    it('should ask the service to stop once, however often it is pressed', async () => {
      const stopping =
        Promise.withResolvers<ServiceAnswer<StopServiceResult>>();
      const session = fakeSession({
        health: healthy(),
        stopService: () => stopping.promise,
      });
      const terminal = await shown(session);

      await press(terminal, 'r', 'r');
      expect(screenOf(terminal)).toContain('Asking the service to stop.');
      stopping.resolve(answered({ stopping: true }, ACCEPTED));

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The service stops, and starts again');
      expect(stops(session)).toBe(1);
    });

    it('should say why the service refused to stop', async () => {
      const terminal = await shown(
        fakeSession({
          health: healthy(),
          stopService: () =>
            Promise.resolve(
              refused(409, {
                error: 'status_conflict',
                message: 'A scan started, so the service does not stop.',
              }),
            ),
        }),
      );

      await press(terminal, 'r');

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('A scan started, so the service does not stop.');
    });

    it('should say that a stop that threw did not happen', async () => {
      const terminal = await shown(
        fakeSession({
          health: healthy(),
          stopService: () =>
            Promise.reject(new ServiceUnreachableError(SOCKET)),
        }),
      );

      await press(terminal, 'r');

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The service was not stopped');
    });

    it('should start nothing while work runs', async () => {
      const session = fakeSession({ health: healthy(BUSY_HEALTH) });
      const terminal = show(session);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('1 scan, 2 improvements');

      await press(terminal, 'r');

      expect(stops(session)).toBe(0);
    });
  });

  describe('when the window has room for one panel', () => {
    it('should show the other panel on tab', async () => {
      const terminal = show(fakeSession({ health: healthy() }), NARROW);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('ENVIRONMENT');

      await press(terminal, KEYS.tab);

      expect(screenOf(terminal)).toContain('Storage and actions');
      expect(screenOf(terminal)).not.toContain('ENVIRONMENT');
    });
  });

  describe('when the service does not answer', () => {
    it('should say so in the status line and show no fault', async () => {
      const terminal = show(
        fakeSession({
          health: () => Promise.reject(new ServiceUnreachableError(SOCKET)),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('! no answer yet');
      expect(screenOf(terminal)).not.toContain('THE CLIENT SAID');
    });
  });

  describe('when one request runs out of time', () => {
    it('should show it as a fault, and go on asking', async () => {
      let asked = 0;
      const terminal = show(
        fakeSession({
          health: () => {
            asked += 1;
            return asked === 1
              ? Promise.reject(new ServiceTimeoutError(SOCKET, 30_000))
              : Promise.resolve(IDLE_HEALTH);
          },
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('ServiceTimeoutError');
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('Everything is in order');
      expect(screenOf(terminal)).not.toContain('THE CLIENT SAID');
    });
  });

  describe('when a request throws a fault', () => {
    it('should show the fault', async () => {
      const terminal = show(
        fakeSession({
          health: () =>
            Promise.reject(
              new TypeError('The answer does not match its schema.'),
            ),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE CLIENT SAID');
    });
  });
});
