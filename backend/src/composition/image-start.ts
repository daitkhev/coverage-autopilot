import type { INestApplication } from '@nestjs/common';

import type { ServiceWiring } from '#composition/app.module';
import type { ServiceLife } from '#infrastructure/http/service-life';
import { faultFieldsOf } from '#infrastructure/logging/fault-fields';
import { SandboxImages } from '#infrastructure/sandbox/sandbox-images';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import { LOGGER, type Logger } from '#ports/logger.port';

/** Nobody waits for the preparation of the start, so nothing aborts it. */
const UNWAITED = new AbortController().signal;

/** What the preparation of the start works with. */
interface ImageStart {
  readonly images: SandboxImages;
  readonly log: Logger;
  readonly life: ServiceLife;
}

async function prepared(
  settings: SandboxSettings,
  start: ImageStart,
): Promise<void> {
  try {
    await start.images.ready(settings, UNWAITED);
  } catch (error) {
    // A stop cuts a preparation short on purpose, which is no fault.
    if (!start.life.stopping) {
      start.log.warn(
        'The image of a sandbox is not ready. The first command in it ' +
          'prepares it again.',
        { image: settings.image, ...faultFieldsOf(error) },
      );
    }
  }
}

/**
 * Starts to make ready the image of each sandbox and returns at once: a
 * first build takes minutes, which neither the start nor a step of an
 * improvement under its deadline should wait for. A command that comes
 * meanwhile waits for the same preparation. A failure is told in the log,
 * and the service goes on.
 */
export function prepareImages(
  application: INestApplication,
  wiring: ServiceWiring,
): void {
  const start: ImageStart = {
    images: application.get(SandboxImages),
    log: application.get<Logger>(LOGGER).child({ component: 'image-start' }),
    life: wiring.life,
  };
  const { config } = wiring;
  for (const settings of [config.sandbox, config.generator.sandbox]) {
    void prepared(settings, start);
  }
}
