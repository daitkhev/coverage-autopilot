import { afterEach, describe, expect, it, vi } from 'vitest';

import { SandboxContainerLeftError } from '#infrastructure/sandbox/errors/sandbox-container-left.error';
import {
  commandRequest,
  FIRST_CONTAINER,
  useSandboxBench,
  WORKING_COPY,
} from '#tests/support/sandbox-bench';
import type { EnginePlay } from '#tests/support/stand-in-engine';

const MINUTE = 60_000;
const REMOVAL_WAIT = 30_000;

/** What a run whose container stays is refused with, before the detail. */
const LEFT =
  `The container ${FIRST_CONTAINER} may still run once its command ended, ` +
  `and write into ${WORKING_COPY}, so nothing of the run is to be read ` +
  'from it. ';

const BUSY =
  'Error response from daemon: cannot remove container ' +
  `"/${FIRST_CONTAINER}": could not kill: device or resource busy`;

const bench = useSandboxBench();

function refusedWith(said: string): NonNullable<EnginePlay['removal']> {
  return { exitCode: 1, output: [{ stream: 'stderr', text: `${said}\n` }] };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DockerSandbox', () => {
  describe('when the engine refuses to remove the container of a command that ended', () => {
    it('should throw SandboxContainerLeftError, which a later try may pass', async () => {
      const running = bench.run({ removal: refusedWith(BUSY) });

      await expect(running).rejects.toThrow(
        new SandboxContainerLeftError(
          `${LEFT}The engine did not remove it. It said: ${BUSY}`,
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: true });
    });
  });

  describe('when the engine says the container is gone already', () => {
    it.each([
      `Error response from daemon: No such container: ${FIRST_CONTAINER}`,
      `Error: no container with name or ID "${FIRST_CONTAINER}" found: ` +
        'no such container',
    ])('should answer the run for "%s"', async (said) => {
      const result = await bench.run({
        exitCode: 3,
        removal: refusedWith(said),
      });

      expect(result).toMatchObject({ outcome: 'exited', exitCode: 3 });
    });
  });

  describe('when the removal does not answer in time', () => {
    it('should stop waiting after thirty seconds and throw SandboxContainerLeftError', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = bench.run({ removal: { endless: true } });
      await vi.waitFor(
        () => {
          expect(bench.calls()).toHaveLength(3);
        },
        { timeout: 10_000 },
      );
      vi.advanceTimersByTime(REMOVAL_WAIT);

      await expect(running).rejects.toThrow(
        new SandboxContainerLeftError(
          `${LEFT}The engine did not answer the removal within 30 seconds.`,
        ),
      );
    });
  });

  describe('when the command ran past its time limit and its container stays', () => {
    it('should throw SandboxContainerLeftError rather than answer timed_out', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = bench.run(
        { endless: true, removal: refusedWith(BUSY) },
        { timeoutMs: 5 * MINUTE },
      );
      await bench.started();
      vi.advanceTimersByTime(5 * MINUTE);

      await expect(running).rejects.toThrow(SandboxContainerLeftError);
    });
  });

  describe('when the signal is aborted and the container stays', () => {
    it('should throw the reason of the signal, not the fault of the removal', async () => {
      const controller = new AbortController();
      const reason = new Error('The improvement was cancelled.');
      const sandbox = bench.sandbox(
        bench.settings({ endless: true, removal: refusedWith(BUSY) }),
      );

      const running = sandbox.run(commandRequest(), controller.signal);
      await bench.started();
      controller.abort(reason);

      await expect(running).rejects.toBe(reason);
      expect(bench.calls().map((call) => call.arguments)).toContainEqual([
        'rm',
        '--force',
        FIRST_CONTAINER,
      ]);
    });
  });
});
