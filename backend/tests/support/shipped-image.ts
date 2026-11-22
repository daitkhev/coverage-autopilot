import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fileDigestOf } from '#infrastructure/sandbox/image-arguments';

/**
 * The file the service builds the image of the generator from, found from
 * the place of this file, as a test finds what the entry file finds.
 */
export const SHIPPED_IMAGE_FILE = fileURLToPath(
  new URL(
    '../../src/shared/infrastructure/sandbox/generator.Dockerfile',
    import.meta.url,
  ),
);

/** The label of an image built from the shipped file, as an engine says it. */
export function shippedImageLabel(): string {
  return fileDigestOf(readFileSync(SHIPPED_IMAGE_FILE));
}
