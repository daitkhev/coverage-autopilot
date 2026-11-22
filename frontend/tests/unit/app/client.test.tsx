import { cleanup, render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceReach } from '#api/service-reach';
import type { ServiceStep } from '#api/service-start';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { Client, type Reach } from '#app/client';
import type { FakeSession } from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import { wholeSession } from '#tests/support/sample-app-session';
import { IDLE_HEALTH } from '#tests/support/sample-repositories';

const LOG = '/home/user/.coverage-autopilot/service.log';
const SOCKET = '/tmp/service.sock';
const TWICE = 2;

const DID_NOT_START: ServiceReach = {
  outcome: 'did_not_start',
  lines: ['AUTOPILOT_QUEUE_POLL_MS: expected a whole number.'],
  log: LOG,
};

function ready(session: FakeSession): ServiceReach {
  return { outcome: 'ready', api: session.api, health: IDLE_HEALTH };
}

/** A reach that answers each try with the next of the given answers. */
function reachWith(...answers: readonly (ServiceReach | Error)[]) {
  const tries: ((step: ServiceStep) => void)[] = [];
  const reach: Reach = (observe) => {
    const answer = answers[Math.min(tries.length, answers.length - 1)];
    tries.push(observe);
    return answer instanceof Error || answer === undefined
      ? Promise.reject(answer ?? new Error('no answer'))
      : Promise.resolve(answer);
  };
  return { reach, tries };
}

function show(reach: Reach, session = wholeSession()) {
  const farewells: (string | undefined)[] = [];
  const terminal = render(
    <Client
      reach={reach}
      sessionOf={() => session}
      onQuit={(farewell) => {
        farewells.push(farewell);
      }}
    />,
  );
  return { terminal, farewells };
}

afterEach(cleanup);

describe('Client', () => {
  it('should say what it does until a service answers', async () => {
    let observe: ((step: ServiceStep) => void) | undefined;
    const { terminal } = show((given) => {
      observe = given;
      return new Promise(() => undefined);
    });

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('Looking for the service');
    observe?.('starting');

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('Starting the service');
  });

  it('should show the screens once a service answers', async () => {
    const session = wholeSession();

    const { terminal } = show(reachWith(ready(session)).reach, session);

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('example/payments');
  });

  describe('when the service does not start', () => {
    it('should show what it wrote and where the rest is', async () => {
      const { terminal } = show(reachWith(DID_NOT_START).reach);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The service did not start.');
      expect(screenOf(terminal)).toContain('AUTOPILOT_QUEUE_POLL_MS');
      expect(screenOf(terminal)).toContain(LOG);
    });

    it('should try again on enter', async () => {
      const session = wholeSession();
      const { reach, tries } = reachWith(DID_NOT_START, ready(session));
      const { terminal } = show(reach, session);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The service did not start.');

      await press(terminal, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('example/payments');
      expect(tries).toHaveLength(TWICE);
    });

    it('should end on q with nothing to say', async () => {
      const { terminal, farewells } = show(reachWith(DID_NOT_START).reach);
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The service did not start.');

      await press(terminal, 'q');

      expect(farewells).toEqual([undefined]);
    });
  });

  it('should end on ctrl+c while it looks for the service', async () => {
    const { terminal, farewells } = show(() => new Promise(() => undefined));
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('Looking for the service');

    await press(terminal, KEYS.ctrlC);

    expect(farewells).toEqual([undefined]);
  });

  it('should leave ctrl+c to the screens once they show', async () => {
    const session = wholeSession();
    const { terminal, farewells } = show(reachWith(ready(session)).reach);
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('example/payments');

    await press(terminal, KEYS.ctrlC);

    expect(farewells).toHaveLength(1);
  });

  it('should show a fault of the way to the service', async () => {
    const fault = new Error('The answer does not match the contract.');

    const { terminal } = show(reachWith(fault).reach);

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('The service could not be reached.');
    expect(screenOf(terminal)).toContain('does not match the contract');
  });

  describe('when the service stops answering under the screens', () => {
    it('should reach it again, and show why it did not come back', async () => {
      const session = wholeSession({
        health: () => Promise.reject(new ServiceUnreachableError(SOCKET)),
      });
      const { reach, tries } = reachWith(ready(session), DID_NOT_START);

      const { terminal } = show(reach, session);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('The service did not start.');
      expect(tries).toHaveLength(TWICE);
    });
  });
});
