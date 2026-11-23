import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import { InvalidSandboxRequestError } from '#infrastructure/sandbox/errors/invalid-sandbox-request.error';
import { SandboxEngineMissingError } from '#infrastructure/sandbox/errors/sandbox-engine-missing.error';
import { SandboxEngineNotRunningError } from '#infrastructure/sandbox/errors/sandbox-engine-not-running.error';
import { SandboxStartFailedError } from '#infrastructure/sandbox/errors/sandbox-start-failed.error';
import { SandboxImages } from '#infrastructure/sandbox/sandbox-images';
import {
  SANDBOX_SETTINGS,
  type SandboxSettings,
} from '#infrastructure/sandbox/sandbox-settings';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { CLOCK } from '#kernel/time/clock';
import { LOGGER } from '#ports/logger.port';
import {
  SANDBOX,
  type Sandbox,
  type SandboxCommandRequest,
} from '#ports/sandbox.port';
import {
  commandRequest,
  FIRST_CONTAINER,
  useSandboxBench,
} from '#tests/support/sandbox-bench';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';

const bench = useSandboxBench();

function runOn(
  settings: SandboxSettings,
  overrides: Partial<SandboxCommandRequest> = {},
): Promise<unknown> {
  return bench
    .sandbox(settings)
    .run(commandRequest(overrides), new AbortController().signal);
}

function engineSays(text: string): SandboxSettings {
  return bench.settings({
    output: [{ stream: 'stderr', text }],
    exitCode: 125,
  });
}

describe('DockerSandbox', () => {
  describe('when the program of the engine is missing', () => {
    it('should throw SandboxEngineMissingError, which a second try does not pass', async () => {
      const settings: SandboxSettings = {
        ...bench.settings(),
        engine: { command: ['/nowhere/container-engine'], environment: {} },
      };

      const running = runOn(settings);

      await expect(running).rejects.toThrow(
        new SandboxEngineMissingError(
          'The program of the container engine, /nowhere/container-engine, ' +
            'could not be started.',
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: false });
    });
  });

  describe('when no engine answers its program', () => {
    it.each([
      'docker: Cannot connect to the Docker daemon at ' +
        'unix:///var/run/docker.sock. Is the docker daemon running?',
      'failed to connect to the docker API at unix:///var/run/docker.sock; ' +
        'check if the path is correct and if the daemon is running',
      'Error: Cannot connect to Podman. Please verify your connection.',
    ])('should throw SandboxEngineNotRunningError for "%s"', async (said) => {
      const running = runOn(engineSays(`${said}\n`));

      await expect(running).rejects.toThrow(
        new SandboxEngineNotRunningError(
          `No container engine answers. Start it and try again. It said: ${said}`,
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: true });
      expect(bench.calls().map((call) => call.arguments)).toContainEqual([
        'rm',
        '--force',
        FIRST_CONTAINER,
      ]);
    });
  });

  describe('when the engine refuses to start the container', () => {
    it('should throw SandboxStartFailedError, which a second try does not pass', async () => {
      const said =
        'docker: Error response from daemon: pull access denied for ' +
        'sandbox-image.';

      const running = runOn(engineSays(`${said}\n`));

      await expect(running).rejects.toThrow(
        new SandboxStartFailedError(
          `The container engine did not start the command. It said: ${said}`,
        ),
      );
      await expect(running).rejects.toMatchObject({ retryable: false });
    });
  });

  describe('when the request cannot be passed to the engine as it is', () => {
    it.each<[string, Partial<SandboxCommandRequest>, string]>([
      [
        'a relative working copy',
        { workingCopyPath: 'copies/1' },
        'The working copy is not an absolute path without a comma, a quote ' +
          'or a line break.',
      ],
      [
        'a working copy with a comma',
        { workingCopyPath: '/copies/1,readonly=false' },
        'The working copy is not an absolute path without a comma, a quote ' +
          'or a line break.',
      ],
      ['no program', { command: [] }, 'The command names no program.'],
      [
        'no time',
        { timeoutMs: 0 },
        'The time limit is not a whole number of milliseconds from 1 to ' +
          '2147483647.',
      ],
      [
        'a part of a millisecond',
        { timeoutMs: 1.5 },
        'The time limit is not a whole number of milliseconds from 1 to ' +
          '2147483647.',
      ],
      [
        'more time than a timer holds',
        { timeoutMs: 2_147_483_648 },
        'The time limit is not a whole number of milliseconds from 1 to ' +
          '2147483647.',
      ],
      [
        'a name that is not one of a variable',
        { environment: { 'NODE-OPTIONS': '1', '1ST': '2' } },
        '"NODE-OPTIONS" is not a name of a variable. "1ST" is not a name of ' +
          'a variable.',
      ],
      [
        'a value with a line break',
        { environment: { MODEL_KEY: 'zz\nINJECTED=1' } },
        'The value of MODEL_KEY holds a line break or a NUL.',
      ],
    ])(
      'should throw InvalidSandboxRequestError for %s and start nothing',
      async (_case, overrides, message) => {
        await expect(runOn(bench.settings(), overrides)).rejects.toThrow(
          new InvalidSandboxRequestError(message),
        );
        expect(bench.calls()).toEqual([]);
      },
    );
  });

  describe('when it is injected by its token', () => {
    it('should be the sandbox of the service', async () => {
      const module = await Test.createTestingModule({
        providers: [
          { provide: SANDBOX, useClass: DockerSandbox },
          { provide: SANDBOX_SETTINGS, useValue: bench.settings() },
          SandboxImages,
          { provide: CLOCK, useValue: bench.clock },
          { provide: ID_GENERATOR, useClass: SequentialIdGenerator },
          { provide: LOGGER, useValue: bench.logger },
        ],
      }).compile();
      const sandbox = module.get<Sandbox>(SANDBOX);

      const result = await sandbox.run(
        commandRequest(),
        new AbortController().signal,
      );
      await module.close();

      expect(sandbox).toBeInstanceOf(DockerSandbox);
      expect(result.outcome).toBe('exited');
      expect(bench.containerCalls()[0]).toContain(FIRST_CONTAINER);
    });
  });
});
