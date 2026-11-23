import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ServiceRun } from '#composition/service-run';
import type { RunningService } from '#infrastructure/service/running-service';
import {
  type HostedService,
  hostedService,
  WORK_WAIT,
} from '#tests/support/hosted-service';
import { MISSING_IMAGE } from '#tests/support/sandbox-bench';
import {
  SHIPPED_IMAGE_FILES,
  shippedImageLabel,
} from '#tests/support/shipped-image';
import type { EnginePlay } from '#tests/support/stand-in-engine';

const LABEL = 'coverage-autopilot.build-file-sha256';
const SANDBOX_IMAGE = 'coverage-autopilot-sandbox:26';
const GENERATOR_IMAGE = 'coverage-autopilot-generator:2.1.329';

/** An image of a registry that a person names for the commands. */
const NAMED_IMAGE = 'node:26-slim';

let folder: string;
let hosted: HostedService | undefined;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'image-start-'));
});

afterEach(async () => {
  await hosted?.close();
  hosted = undefined;
  rmSync(folder, { recursive: true, force: true });
});

function running(run: ServiceRun): RunningService {
  if (run.outcome !== 'running') {
    throw new Error(`The service did not run: ${run.outcome}.`);
  }
  return run.service;
}

/**
 * A service whose engine lacks both images, and builds as `build` says,
 * with the variables a test sets.
 */
async function startedWith(
  build: NonNullable<EnginePlay['build']>,
  variables: Record<string, string> = {},
): Promise<{ service: RunningService; on: HostedService }> {
  const on = hostedService({ inspection: MISSING_IMAGE, build }, variables);
  hosted = on;
  return { service: running(await on.bench.run()), on };
}

function callsOf(on: HostedService, verb: string): (readonly string[])[] {
  return on
    .engineCalls()
    .map((call) => call.arguments)
    .filter((args) => args[0] === verb);
}

/** A build of `image` from `file`, labelled with it, before the folder. */
function buildOf(image: string, file: string): string[] {
  return [
    ...['build', '--tag', image],
    ...['--label', `${LABEL}=${shippedImageLabel(image)}`],
    ...['--file', file],
  ];
}

/** The builds the engine was asked for, without their folders. */
function buildsOf(on: HostedService): (readonly string[])[] {
  return callsOf(on, 'build').map((args) => args.slice(0, -1));
}

/** The level, the message, the image and the fault of each line of the start. */
function imageLines(on: HostedService): unknown[][] {
  return on.bench
    .logLines()
    .filter((line) => line.fields['component'] === 'image-start')
    .map(({ level, message, fields }) => [
      level,
      message,
      fields['image'],
      fields['errorCode'],
    ]);
}

describe('prepareImages', () => {
  describe('when a service starts and its engine lacks the images', () => {
    it('should build the image of the commands and that of the generator, pull nothing, and answer meanwhile', async () => {
      const built = join(folder, 'built');
      const { on } = await startedWith({ until: built });

      await expect.poll(() => callsOf(on, 'build').length, WORK_WAIT).toBe(2);
      const answer = await on.send('/nowhere');
      writeFileSync(built, '');

      expect(answer.status).toBe(404);
      expect(buildsOf(on)).toEqual(
        expect.arrayContaining([
          buildOf(SANDBOX_IMAGE, SHIPPED_IMAGE_FILES.sandbox),
          buildOf(GENERATOR_IMAGE, SHIPPED_IMAGE_FILES.generator),
        ]),
      );
      expect(callsOf(on, 'pull')).toEqual([]);
    });
  });

  describe('when a person names another image for the commands', () => {
    it('should pull that image, and build the image of the generator alone', async () => {
      const { on } = await startedWith(
        {},
        { AUTOPILOT_SANDBOX_IMAGE: NAMED_IMAGE },
      );

      await expect
        .poll(() => callsOf(on, 'pull'), WORK_WAIT)
        .toEqual([['pull', NAMED_IMAGE]]);
      await expect
        .poll(() => buildsOf(on), WORK_WAIT)
        .toEqual([buildOf(GENERATOR_IMAGE, SHIPPED_IMAGE_FILES.generator)]);
    });
  });

  describe('when the preparation fails', () => {
    it('should say so in a warning for each image and go on answering', async () => {
      const said = 'npm error 404 Not Found';
      const { on } = await startedWith({
        exitCode: 1,
        output: [{ stream: 'stderr', text: `${said}\n` }],
      });

      await expect.poll(() => imageLines(on).length, WORK_WAIT).toBe(2);
      expect(imageLines(on)).toEqual(
        expect.arrayContaining(
          [SANDBOX_IMAGE, GENERATOR_IMAGE].map((image) => [
            'warn',
            'The image of a sandbox is not ready. The first command in it ' +
              'prepares it again.',
            image,
            'sandbox_image_build_failed',
          ]),
        ),
      );
      expect((await on.send('/nowhere')).status).toBe(404);
    });
  });

  describe('when the service stops while the images are built', () => {
    it('should cut the builds short and say nothing of them', async () => {
      const { service, on } = await startedWith({
        until: join(folder, 'never'),
      });
      await expect.poll(() => callsOf(on, 'build').length, WORK_WAIT).toBe(2);

      await service.stop();

      expect(imageLines(on)).toEqual([]);
    });
  });
});
