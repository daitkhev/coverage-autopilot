import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { serveProcess } from '#composition/service-process';

/**
 * Beside the folder of the sources, and beside the folder of the bundle
 * once the service is built, so the same step up finds it from both.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

/** The package of the service, which the same step up finds. */
export const PACKAGE_FILE = fileURLToPath(
  new URL('../package.json', import.meta.url),
);

if (import.meta.main) {
  process.exitCode = await serveProcess({
    environment: process.env,
    user: { uid: process.getuid?.(), gid: process.getgid?.() },
    migrationsFolder: MIGRATIONS_FOLDER,
    packageFile: PACKAGE_FILE,
    errors: process.stderr,
    signals: process,
  });
}
