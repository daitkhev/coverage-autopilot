import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  SandboxCommandRequest,
  SandboxCommandResult,
} from '#ports/sandbox.port';
import {
  commandRequest,
  FIRST_CONTAINER,
  useSandboxBench,
  WORKING_COPY,
} from '#tests/support/sandbox-bench';
import type { EnginePlay } from '#tests/support/stand-in-engine';

const MINUTE = 60_000;

const bench = useSandboxBench();

function run(
  play: EnginePlay = {},
  overrides: Partial<SandboxCommandRequest> = {},
): Promise<SandboxCommandResult> {
  const sandbox = bench.sandbox(bench.settings(play));
  return sandbox.run(commandRequest(overrides), new AbortController().signal);
}

function argumentsOfCalls(): (readonly string[])[] {
  return bench.calls().map((call) => call.arguments);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DockerSandbox', () => {
  describe('run', () => {
    it('should run the command in a closed container that sees the working copy alone', async () => {
      await run();

      expect(argumentsOfCalls()[0]).toEqual([
        'run',
        '--name',
        FIRST_CONTAINER,
        '--rm',
        '--init',
        '--network',
        'none',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--user',
        '1000:1000',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,nosuid,nodev,exec,size=64m',
        '--memory',
        '2048m',
        '--memory-swap',
        '2048m',
        '--cpus',
        '1.5',
        '--pids-limit',
        '256',
        '--mount',
        `type=bind,source=${WORKING_COPY},target=/workspace`,
        '--workdir',
        '/workspace',
        '--env-file',
        '/dev/stdin',
        'sandbox-image:1',
        'npx',
        'vitest',
        'run',
        '--coverage',
      ]);
    });

    it('should give the engine its default network when the request opens it', async () => {
      await run({}, { network: 'open' });

      const open = argumentsOfCalls()[0] ?? [];
      expect(open).not.toContain('--network');
      expect(open.slice(0, 7)).toEqual([
        'run',
        '--name',
        FIRST_CONTAINER,
        '--rm',
        '--init',
        '--cap-drop',
        'ALL',
      ]);
    });

    it('should give the command exactly its variables, and no value as an argument', async () => {
      const environment = { HOME: '/tmp', CI: 'true', MODEL_KEY: 'zz-private' };

      await run({}, { environment });

      const [call] = bench.calls();
      expect(call?.input).toBe('HOME=/tmp\nCI=true\nMODEL_KEY=zz-private\n');
      expect(call?.arguments.join(' ')).not.toContain('zz-private');
    });

    it('should start the engine with the environment of its settings alone', async () => {
      const settings = bench.settings();

      await bench
        .sandbox(settings)
        .run(commandRequest(), new AbortController().signal);

      expect(bench.calls()).toHaveLength(2);
      for (const call of bench.calls()) {
        expect(call.environment).toEqual(settings.engine.environment);
      }
    });

    it('should answer a command that failed with its exit code and its output', async () => {
      const running = run({
        output: [
          { stream: 'stdout', text: 'FAIL src/a.test.ts\n' },
          { stream: 'stdout', text: 'Tests  1 failed (3)\n' },
        ],
        exitCode: 1,
      });
      bench.clock.advance(4_250);

      await expect(running).resolves.toEqual({
        outcome: 'exited',
        exitCode: 1,
        output: 'FAIL src/a.test.ts\nTests  1 failed (3)\n',
        outputTruncated: false,
        durationMs: 4_250,
      });
    });

    it('should keep what the command wrote to both streams', async () => {
      const result = await run({
        output: [
          { stream: 'stdout', text: 'to the output\n' },
          { stream: 'stderr', text: 'to the errors\n' },
        ],
      });

      expect(result.output.split('\n').sort()).toEqual([
        '',
        'to the errors',
        'to the output',
      ]);
      expect(result.exitCode).toBe(0);
    });

    it('should keep the end of an output longer than its limit', async () => {
      const play: EnginePlay = {
        output: [
          { stream: 'stdout', text: 'the start, ' },
          { stream: 'stdout', text: 'then the end' },
        ],
      };

      const result = await bench
        .sandbox(bench.settings(play, 7))
        .run(commandRequest(), new AbortController().signal);

      expect(result.output).toBe('the end');
      expect(result.outputTruncated).toBe(true);
    });

    it('should remove the container once the command has ended', async () => {
      await run();

      expect(argumentsOfCalls().slice(1)).toEqual([
        ['rm', '--force', FIRST_CONTAINER],
      ]);
    });

    it('should give each container a name of its own', async () => {
      const sandbox = bench.sandbox(bench.settings());
      const signal = new AbortController().signal;

      await sandbox.run(commandRequest(), signal);
      await sandbox.run(commandRequest(), signal);

      const second = 'coverage-autopilot-00000000-0000-4000-8000-000000000002';
      expect(argumentsOfCalls().map((call) => call[2])).toEqual([
        FIRST_CONTAINER,
        FIRST_CONTAINER,
        second,
        second,
      ]);
    });

    describe('when the command runs past its time limit', () => {
      it('should stop the container and answer timed_out', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

        const running = run({ endless: true }, { timeoutMs: 5 * MINUTE });
        bench.clock.advance(5 * MINUTE);
        vi.advanceTimersByTime(5 * MINUTE);

        await expect(running).resolves.toEqual({
          outcome: 'timed_out',
          exitCode: null,
          output: '',
          outputTruncated: false,
          durationMs: 5 * MINUTE,
        });
        expect(argumentsOfCalls()).toContainEqual([
          'rm',
          '--force',
          FIRST_CONTAINER,
        ]);
      });
    });

    describe('when the signal is aborted while the command runs', () => {
      it('should stop the container and throw the reason of the signal', async () => {
        const controller = new AbortController();
        const reason = new Error('The improvement was cancelled.');
        const sandbox = bench.sandbox(bench.settings({ endless: true }));

        const running = sandbox.run(commandRequest(), controller.signal);
        controller.abort(reason);

        await expect(running).rejects.toBe(reason);
        expect(argumentsOfCalls()).toContainEqual([
          'rm',
          '--force',
          FIRST_CONTAINER,
        ]);
      });
    });

    describe('when the signal was aborted before', () => {
      it('should throw its reason and start nothing', async () => {
        const reason = new Error('The worker stops.');
        const sandbox = bench.sandbox(bench.settings());

        await expect(
          sandbox.run(commandRequest(), AbortSignal.abort(reason)),
        ).rejects.toBe(reason);
        expect(bench.calls()).toEqual([]);
      });
    });
  });
});
