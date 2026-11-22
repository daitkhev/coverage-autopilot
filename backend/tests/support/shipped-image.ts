import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { VARIABLES } from '#infrastructure/config/service-environment.schema';
import type { ShippedImageFiles } from '#infrastructure/config/shipped-images';
import { fileDigestOf } from '#infrastructure/sandbox/image-arguments';

/**
 * The files the service builds its images from, found from the place of
 * this file, as a test finds what the entry file finds.
 */
export const SHIPPED_IMAGE_FILES: ShippedImageFiles = {
  sandbox: fileURLToPath(
    new URL(
      '../../src/shared/infrastructure/sandbox/sandbox.Dockerfile',
      import.meta.url,
    ),
  ),
  generator: fileURLToPath(
    new URL(
      '../../src/shared/infrastructure/sandbox/generator.Dockerfile',
      import.meta.url,
    ),
  ),
};

/** Each image the service makes, by its default name, and its file. */
const SHIPPED_FILE_OF: Readonly<Record<string, string>> = {
  [VARIABLES.AUTOPILOT_SANDBOX_IMAGE.fallback]: SHIPPED_IMAGE_FILES.sandbox,
  [VARIABLES.AUTOPILOT_GENERATOR_IMAGE.fallback]: SHIPPED_IMAGE_FILES.generator,
};

/**
 * The label of `image` as an engine says it once the service built it
 * from the file it ships for it. An image the service does not make has
 * no label.
 */
export function shippedImageLabel(image: string): string {
  const file = SHIPPED_FILE_OF[image];
  return file === undefined ? '' : fileDigestOf(readFileSync(file));
}
