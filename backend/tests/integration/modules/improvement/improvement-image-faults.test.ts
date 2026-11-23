import { afterEach, describe, expect, it } from 'vitest';

import { SandboxEngineNotRunningError } from '#infrastructure/sandbox/errors/sandbox-engine-not-running.error';
import { SandboxImageBuildFailedError } from '#infrastructure/sandbox/errors/sandbox-image-build-failed.error';
import {
  type ImprovementWorld,
  improvementWorld,
} from '#tests/support/improvement-module-world';

/** What the sandbox of the generator says when it could not build its image. */
const NOT_BUILT =
  'The engine did not build the image coverage-autopilot-generator:2.1.329 ' +
  'from /opt/autopilot/generator.Dockerfile. It ended with the exit code 1, ' +
  'and the end of what it said is: npm error 404 Not Found';

let world: ImprovementWorld | undefined;

afterEach(async () => {
  await world?.close();
  world = undefined;
});

describe('ImprovementModule', () => {
  describe('when the sandbox of the generator cannot build its image', () => {
    it('should fail as a generator that is unavailable, name the image, and keep no call', async () => {
      world = await improvementWorld();
      const { work, generator, start, read } = world;
      generator.answer = new SandboxImageBuildFailedError(NOT_BUILT);
      const { id } = await start();

      await work();

      expect(await read(id)).toMatchObject({
        status: 'failed',
        failure: {
          reason: 'generator_unavailable',
          message:
            'The work of generating stopped on the fault ' +
            `sandbox_image_build_failed: ${NOT_BUILT}`,
        },
        usage: { attempts: 1, tokens: 0 },
        attempts: [
          {
            number: 1,
            status: 'closed',
            generationOutcome: null,
            tokensUsed: 0,
          },
        ],
      });
    });
  });

  describe('when no engine answers while the image is made ready', () => {
    it('should run the job again as the same attempt until the queue gives up', async () => {
      world = await improvementWorld();
      const { work, generator, start, read } = world;
      generator.answer = new SandboxEngineNotRunningError(
        'No container engine answers. Start it and try again.',
      );
      const { id } = await start();

      await work();
      await work();
      await work();

      const owners = generator.requests.map((request) => request.owner);
      expect(owners).toHaveLength(3);
      expect(new Set(owners)).toEqual(new Set([owners[0]]));
      expect(owners[0]).toMatch(/:attempt:1$/u);
      expect(await read(id)).toMatchObject({
        status: 'failed',
        failure: { reason: 'retries_exhausted' },
        usage: { attempts: 1, tokens: 0 },
      });
    });
  });
});
