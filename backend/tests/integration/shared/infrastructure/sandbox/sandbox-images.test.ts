import { writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SandboxEngineNotRunningError } from '#infrastructure/sandbox/errors/sandbox-engine-not-running.error';
import { SandboxImageBuildFailedError } from '#infrastructure/sandbox/errors/sandbox-image-build-failed.error';
import { SandboxImageFileMissingError } from '#infrastructure/sandbox/errors/sandbox-image-file-missing.error';
import { SandboxImagePullFailedError } from '#infrastructure/sandbox/errors/sandbox-image-pull-failed.error';
import { SandboxImages } from '#infrastructure/sandbox/sandbox-images';
import {
  commandRequest,
  MISSING_IMAGE,
  useSandboxBench,
} from '#tests/support/sandbox-bench';
import { SHIPPED_IMAGE_FILE } from '#tests/support/shipped-image';
import type { EnginePlay } from '#tests/support/stand-in-engine';

const MINUTE = 60_000;
const QUESTION_WAIT = 30_000;

const NOT_RUNNING =
  'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. ' +
  'Is the docker daemon running?';

const NOT_BUILT = `The engine did not build the image built-image:1 from ${SHIPPED_IMAGE_FILE}.`;

const bench = useSandboxBench();

function failing(said: string): NonNullable<EnginePlay['build']> {
  return { exitCode: 1, output: [{ stream: 'stderr', text: `${said}\n` }] };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SandboxImages', () => {
  describe('when two commands come while the image is built', () => {
    it('should build it once for both', async () => {
      const settings = bench.builtSettings({ inspection: MISSING_IMAGE });
      const sandbox = bench.sandbox(settings);
      const signal = new AbortController().signal;

      await Promise.all([
        sandbox.run(commandRequest(), signal),
        sandbox.run(commandRequest(), signal),
      ]);

      expect(
        bench.verbs().filter((verb) => verb !== 'run' && verb !== 'rm'),
      ).toEqual(['image', 'build']);
      expect(bench.verbs().filter((verb) => verb === 'run')).toHaveLength(2);
    });
  });

  describe('when a command is aborted while it waits for the build', () => {
    it('should stop waiting, and leave the build to the next command', async () => {
      const built = bench.place('built');
      const sandbox = bench.sandbox(
        bench.builtSettings({
          inspection: MISSING_IMAGE,
          build: { until: built },
        }),
      );
      const controller = new AbortController();
      const reason = new Error('The improvement was cancelled.');

      const first = sandbox.run(commandRequest(), controller.signal);
      await bench.recorded('build');
      controller.abort(reason);
      await expect(first).rejects.toBe(reason);
      const second = sandbox.run(
        commandRequest(),
        new AbortController().signal,
      );
      writeFileSync(built, '');

      await expect(second).resolves.toMatchObject({ outcome: 'exited' });
      expect(bench.verbs()).toEqual(['image', 'build', 'run', 'rm']);
    });
  });

  describe('when the build fails', () => {
    it('should throw SandboxImageBuildFailedError with the end of what the engine said, and start nothing', async () => {
      const said = `${'a step of the build\n'.repeat(300)}npm error 404 Not Found`;
      const settings = bench.builtSettings({
        inspection: MISSING_IMAGE,
        build: failing(said),
      });

      const running = bench.runOn(settings);

      await expect(running).rejects.toThrow(SandboxImageBuildFailedError);
      const fault = await running.catch((error: unknown) => error);
      expect(fault).toMatchObject({ retryable: false });
      const { message } = fault as Error;
      const opening =
        `${NOT_BUILT} It ended with the exit code 1, and the end of what ` +
        'it said is: ';
      expect(message.indexOf(opening)).toBe(0);
      expect(message).toMatch(
        /\na step of the build\nnpm error 404 Not Found$/u,
      );
      expect(message.length).toBeLessThan(said.length);
      expect(bench.verbs()).toEqual(['image', 'build']);
    });

    it('should try again at the next command, since a failure is not kept', async () => {
      const sandbox = bench.sandbox(
        bench.builtSettings({
          inspection: MISSING_IMAGE,
          build: failing('npm error network timeout'),
        }),
      );
      const signal = new AbortController().signal;

      await expect(sandbox.run(commandRequest(), signal)).rejects.toThrow(
        SandboxImageBuildFailedError,
      );
      await expect(sandbox.run(commandRequest(), signal)).rejects.toThrow(
        SandboxImageBuildFailedError,
      );
      expect(bench.verbs()).toEqual(['image', 'build', 'image', 'build']);
    });

    it('should throw SandboxEngineNotRunningError when no engine answers the build', async () => {
      const said = 'Error: Cannot connect to Podman.';

      const running = bench.runOn(
        bench.builtSettings({
          inspection: MISSING_IMAGE,
          build: failing(said),
        }),
      );

      await expect(running).rejects.toThrow(
        new SandboxEngineNotRunningError(
          `No container engine answers. Start it and try again. It said: ${said}`,
        ),
      );
    });
  });

  describe('when the build does not end within its limit', () => {
    it('should stop it after ten minutes and throw SandboxImageBuildFailedError', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = bench.runOn(
        bench.builtSettings({
          inspection: MISSING_IMAGE,
          build: { endless: true },
        }),
      );
      await bench.recorded('build');
      vi.advanceTimersByTime(10 * MINUTE);

      await expect(running).rejects.toThrow(
        new SandboxImageBuildFailedError(
          `${NOT_BUILT} It did not end within 10 minutes.`,
        ),
      );
    });
  });

  describe('when the pull fails', () => {
    it('should throw SandboxImagePullFailedError with what the engine said, which a second try does not pass', async () => {
      const said =
        'Error response from daemon: pull access denied for sandbox-image, ' +
        'repository does not exist';

      const running = bench.runOn(
        bench.settings({ inspection: MISSING_IMAGE, pull: failing(said) }),
      );

      await expect(running).rejects.toThrow(
        new SandboxImagePullFailedError(
          'The engine has no image sandbox-image:1 and did not pull it. It ' +
            `ended with the exit code 1, and the end of what it said is: ${said}`,
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: false });
    });
  });

  describe('when the file to build from is missing', () => {
    it('should throw SandboxImageFileMissingError and ask the engine nothing', async () => {
      const file = bench.place('nowhere.Dockerfile');

      const running = bench.runOn({
        ...bench.builtSettings(),
        build: { file },
      });

      await expect(running).rejects.toThrow(
        new SandboxImageFileMissingError(
          `The image built-image:1 is built from ${file}, which cannot be ` +
            'read. The package of the service is incomplete: install it again.',
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: false });
      expect(bench.calls()).toEqual([]);
    });
  });

  describe('when no engine answers whether it has the image', () => {
    it('should throw SandboxEngineNotRunningError, which a later try may pass', async () => {
      const inspection = failing(NOT_RUNNING);

      const running = bench.runOn(bench.settings({ inspection }));

      await expect(running).rejects.toThrow(
        new SandboxEngineNotRunningError(
          `No container engine answers. Start it and try again. It said: ${NOT_RUNNING}`,
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: true });
      expect(bench.verbs()).toEqual(['image']);
    });

    it('should stop waiting for a stuck engine after thirty seconds', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = bench.runOn(
        bench.settings({ inspection: { endless: true } }),
      );
      await bench.recorded('image');
      vi.advanceTimersByTime(QUESTION_WAIT);

      await expect(running).rejects.toThrow(
        new SandboxEngineNotRunningError(
          'The engine did not say within 30 seconds whether it has the image ' +
            'sandbox-image:1.',
        ),
      );
    });
  });

  describe('when a helper of the engine outlives a stuck question', () => {
    it('should stop waiting all the same', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = bench.runOn(
        bench.settings({ inspection: { endless: true, helper: true } }),
      );
      await bench.recorded('image');
      vi.advanceTimersByTime(QUESTION_WAIT);

      await expect(running).rejects.toThrow(SandboxEngineNotRunningError);
    });
  });

  describe('when the service stops while an image is built', () => {
    it('should cut the build short and fail the command that waits for it', async () => {
      const images = new SandboxImages(bench.logger, bench.clock);
      const settings = bench.builtSettings({
        inspection: MISSING_IMAGE,
        build: { endless: true },
      });

      const waiting = images.ready(settings, new AbortController().signal);
      await bench.recorded('build');
      await images.onModuleDestroy();

      await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    });
  });
});
