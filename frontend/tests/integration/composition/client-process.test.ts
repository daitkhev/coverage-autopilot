import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HELP_TEXT } from '#commands/command-grammar';
import { type ClientProcess, runClient } from '#composition/client-process';
import { fakeTerminal } from '#tests/support/fake-terminal';
import { PATIENT } from '#tests/support/keys';
import { IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  type ServiceStartBench,
  serviceStartBench,
} from '#tests/support/service-start-bench';

const DONE = 0;
const FAILED = 1;
const WRONG_LINE = 2;

/** A program that says why it cannot start and leaves, as a broken one does. */
const BROKEN_SERVICE = ['/bin/sh', '-c', 'echo "no database" >&2; exit 3'];

describe('runClient', () => {
  let bench: ServiceStartBench;

  beforeEach(() => {
    bench = serviceStartBench();
  });

  afterEach(async () => {
    await bench.close();
  });

  /** One run of the client, and what it wrote to its two streams. */
  async function run(
    argv: readonly string[],
    given: Partial<ClientProcess> = {},
  ) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runClient({
      argv,
      environment: { AUTOPILOT_INSTANCE_DIR: bench.location.directory },
      service: bench.standIn({ health: IDLE_HEALTH }),
      terminal: undefined,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      ...given,
    });
    return { code, out, err };
  }

  it('should print the help on standard output', async () => {
    const { code, out, err } = await run(['--help']);

    expect(code).toBe(DONE);
    expect(out).toEqual([HELP_TEXT]);
    expect(err).toEqual([]);
    expect(bench.startedIds()).toEqual([]);
  });

  it('should say what is wrong with a line, and how it is written', async () => {
    const { code, out, err } = await run(['scan']);

    expect(code).toBe(WRONG_LINE);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('scan <repo>');
  });

  it('should print the help when it has no command and no terminal', async () => {
    const { code, out, err } = await run([]);

    expect(code).toBe(WRONG_LINE);
    expect(out).toEqual([]);
    expect(err).toEqual([HELP_TEXT]);
    expect(bench.startedIds()).toEqual([]);
  });

  describe('when it runs a command', () => {
    it('should start the service, say so, and leave it running', async () => {
      const { code, out, err } = await run(['doctor']);

      expect(code).toBe(DONE);
      expect(err).toEqual(['Starting the service']);
      expect(out.join('\n')).toContain(IDLE_HEALTH.serviceVersion);
      expect(bench.runningIds()).toHaveLength(1);
    });

    it('should use the service that runs, and say nothing of it', async () => {
      await bench.runStandIn({ health: IDLE_HEALTH });

      const { code, err } = await run(['doctor', '--json']);

      expect(code).toBe(DONE);
      expect(err).toEqual([]);
      expect(bench.startedIds()).toHaveLength(1);
    });

    it('should print the value of the contract with --json', async () => {
      const { out } = await run(['doctor', '--json']);

      expect(out.map((line) => JSON.parse(line) as unknown)).toEqual([
        IDLE_HEALTH,
      ]);
    });

    it('should stop a service of its own once the command is done', async () => {
      const { code } = await run(['doctor', '--isolated']);

      expect(code).toBe(DONE);
      expect(bench.startedIds()).toHaveLength(1);
      expect(bench.runningIds()).toEqual([]);
    });

    it('should fail with what a service that did not start wrote', async () => {
      const [program = '', ...rest] = BROKEN_SERVICE;

      const { code, out, err } = await run(['doctor'], {
        service: [program, ...rest],
      });

      expect(code).toBe(FAILED);
      expect(out).toEqual([]);
      expect(err).toEqual([
        'Starting the service',
        'The service did not start.',
        'no database',
        `The rest is in ${bench.location.log}.`,
      ]);
    });
  });

  describe('when it has a terminal and no command', () => {
    it('should show the screens until the user quits', async () => {
      const terminal = fakeTerminal();

      const running = run([], { terminal: terminal.ends });
      // The header says so once the screens have asked the service, and
      // by then they take the keys.
      await expect.poll(terminal.drawn, PATIENT).toContain('service up');
      terminal.press('q');

      await expect(running).resolves.toMatchObject({ code: DONE, err: [] });
    });
  });
});
