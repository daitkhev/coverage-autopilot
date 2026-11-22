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
  SHIPPED_IMAGE_FILE,
  shippedImageLabel,
} from '#tests/support/shipped-image';
import type { EnginePlay } from '#tests/support/stand-in-engine';

const GENERATOR_IMAGE = 'coverage-autopilot-generator:2.1.329';

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

/** A service whose engine lacks both images, and builds as `build` says. */
async function startedWith(
  build: NonNullable<EnginePlay['build']>,
): Promise<{ service: RunningService; on: HostedService }> {
  const on = hostedService({ inspection: MISSING_IMAGE, build });
  hosted = on;
  return { service: running(await on.bench.run()), on };
}

function callsOf(on: HostedService, verb: string): (readonly string[])[] {
  return on
    .engineCalls()
    .map((call) => call.arguments)
    .filter((args) => args[0] === verb);
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
    it('should build the image of the generator and pull the other, and answer meanwhile', async () => {
      const built = join(folder, 'built');
      const { on } = await startedWith({ until: built });

      await expect.poll(() => callsOf(on, 'build').length, WORK_WAIT).toBe(1);
      const answer = await on.send('/nowhere');
      writeFileSync(built, '');

      expect(answer.status).toBe(404);
      expect(callsOf(on, 'build')[0]?.slice(0, -1)).toEqual([
        'build',
        '--tag',
        GENERATOR_IMAGE,
        '--label',
        `coverage-autopilot.build-file-sha256=${shippedImageLabel()}`,
        '--file',
        SHIPPED_IMAGE_FILE,
      ]);
      await expect
        .poll(() => callsOf(on, 'pull'), WORK_WAIT)
        .toEqual([['pull', 'node:26-slim']]);
    });
  });

  describe('when the preparation fails', () => {
    it('should say so in a warning and go on answering', async () => {
      const said = 'npm error 404 Not Found';
      const { on } = await startedWith({
        exitCode: 1,
        output: [{ stream: 'stderr', text: `${said}\n` }],
      });

      await expect
        .poll(() => imageLines(on), WORK_WAIT)
        .toEqual([
          [
            'warn',
            'The image of a sandbox is not ready. The first command in it ' +
              'prepares it again.',
            GENERATOR_IMAGE,
            'sandbox_image_build_failed',
          ],
        ]);
      expect((await on.send('/nowhere')).status).toBe(404);
    });
  });

  describe('when the service stops while the image is built', () => {
    it('should cut the build short and say nothing of it', async () => {
      const { service, on } = await startedWith({
        until: join(folder, 'never'),
      });
      await expect.poll(() => callsOf(on, 'build').length, WORK_WAIT).toBe(1);

      await service.stop();

      expect(imageLines(on)).toEqual([]);
    });
  });
});
