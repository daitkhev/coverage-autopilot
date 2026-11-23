import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { serveProcess } from '#composition/service-process';

/**
 * In the folder of the code that applies them. The build puts them at the
 * same path from the bundle, so one step finds them from both.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('./shared/infrastructure/database/migrations/', import.meta.url),
);

/** The package of the service, one step up from the sources and the bundle. */
export const PACKAGE_FILE = fileURLToPath(
  new URL('../package.json', import.meta.url),
);

/**
 * What the images the service makes are built from: the image of the
 * commands of a repository and that of the generator. The build of the
 * package puts each file at the path it has from this file in the sources.
 */
export const IMAGE_FILES = {
  sandbox: fileURLToPath(
    new URL(
      './shared/infrastructure/sandbox/sandbox.Dockerfile',
      import.meta.url,
    ),
  ),
  generator: fileURLToPath(
    new URL(
      './shared/infrastructure/sandbox/generator.Dockerfile',
      import.meta.url,
    ),
  ),
};

if (import.meta.main) {
  process.exitCode = await serveProcess({
    environment: process.env,
    user: { uid: process.getuid?.(), gid: process.getgid?.() },
    migrationsFolder: MIGRATIONS_FOLDER,
    packageFile: PACKAGE_FILE,
    imageFiles: IMAGE_FILES,
    errors: process.stderr,
    signals: process,
  });
}
