import { existsSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ClientProcess, runClient } from '#composition/client-process';
import { fakeTerminal } from '#tests/support/fake-terminal';
import { PATIENT } from '#tests/support/keys';
import { IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  type ServiceStartBench,
  serviceStartBench,
} from '#tests/support/service-start-bench';
import {
  type SignalStandIn,
  signalStandIn,
} from '#tests/support/signal-stand-in';

/** What a terminal is told to show its other screen again. */
const LEAVE_OTHER_SCREEN = '\u001B[?1049l';

const SIGHUP_CODE = 129;
const SIGINT_CODE = 130;
const SIGTERM_CODE = 143;

describe('runClient', () => {
  let bench: ServiceStartBench;
  let signals: SignalStandIn;
  // A run that a signal ended goes on writing, so each test has its own.
  let out: string[];
  let err: string[];

  beforeEach(() => {
    bench = serviceStartBench();
    signals = signalStandIn();
    out = [];
    err = [];
  });

  afterEach(async () => {
    await bench.close();
  });

  /** A run of the client whose signals the test sends. */
  async function run(
    argv: readonly string[],
    given: Partial<ClientProcess> = {},
  ): Promise<number> {
    return runClient({
      argv,
      environment: { AUTOPILOT_INSTANCE_DIR: bench.location.directory },
      service: bench.standIn({ health: IDLE_HEALTH }),
      terminal: undefined,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      signals,
      ...given,
    });
  }

  /** Writes what a run says, and sends the signals once it starts one. */
  function sendingOnStart(
    ...sent: Parameters<SignalStandIn['send']>[0][]
  ): (line: string) => void {
    const said = err;
    return (line) => {
      said.push(line);
      if (line === 'Starting the service') {
        sent.forEach((signal) => {
          signals.send(signal);
        });
      }
    };
  }

  function expectNothingOfItsOwnLeft(): void {
    expect(bench.startedIds()).toHaveLength(1);
    expect(bench.runningIds()).toEqual([]);
    expect(bench.instanceFolders()).toHaveLength(1);
    expect(bench.instanceFolders().filter(existsSync)).toEqual([]);
  }

  it('should stop listening for signals once it has left', async () => {
    await expect(run(['doctor'])).resolves.toBe(0);

    expect(signals.listeners()).toBe(0);
    expect(signals.exits).toEqual([]);
  });

  describe('when a signal comes while the screens show a service of its own', () => {
    it('should stop it, remove its folder, give the terminal back, and end with the code of the signal', async () => {
      const terminal = fakeTerminal();
      const running = run(['--isolated'], { terminal: terminal.ends });
      await expect.poll(terminal.drawn, PATIENT).toContain('service up');

      signals.send('SIGTERM');

      await expect(running).resolves.toBe(SIGTERM_CODE);
      expect(signals.exits).toEqual([SIGTERM_CODE]);
      expectNothingOfItsOwnLeft();
      expect(terminal.drawn().lastIndexOf(LEAVE_OTHER_SCREEN)).toBeGreaterThan(
        terminal.drawn().lastIndexOf('service up'),
      );
      expect(signals.listeners()).toBe(0);
    });
  });

  describe('when a signal comes while a service of its own starts', () => {
    it('should stop it once it started, and remove its folder', async () => {
      const code = await run(['doctor', '--isolated'], {
        err: sendingOnStart('SIGINT'),
      });

      expect(code).toBe(SIGINT_CODE);
      expect(signals.exits).toEqual([SIGINT_CODE]);
      expectNothingOfItsOwnLeft();
    });

    it('should start no second leave on a second signal', async () => {
      const code = await run(['doctor', '--isolated'], {
        err: sendingOnStart('SIGINT', 'SIGTERM', 'SIGINT'),
      });

      expect(code).toBe(SIGINT_CODE);
      expect(signals.exits).toEqual([SIGINT_CODE]);
      expectNothingOfItsOwnLeft();
    });
  });

  describe('when a signal comes while it uses the service of the user', () => {
    it('should leave that service running', async () => {
      const code = await run(['doctor'], { err: sendingOnStart('SIGHUP') });

      expect(code).toBe(SIGHUP_CODE);
      expect(signals.exits).toEqual([SIGHUP_CODE]);
      // The command goes on until the process ends, which the test is not.
      await expect
        .poll(() => out.join('\n'), PATIENT)
        .toContain(IDLE_HEALTH.serviceVersion);
      expect(bench.runningIds()).toHaveLength(1);
    });
  });
});
