import { readFileSync } from 'node:fs';
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
const PACKAGE_FILE = new URL('../package.json', import.meta.url);

/** The version of the package, which `GET /health` reports. */
function packageVersion(): string {
  const text = readFileSync(PACKAGE_FILE, 'utf8');
  const { version } = JSON.parse(text) as { readonly version: string };
  return version;
}

/** A second signal finds no listener and ends the process at once. */
const STOP_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** A system with no ids of users, whose service the configuration refuses. */
const NO_ID = -1;

if (import.meta.main) {
  process.exitCode = await serveProcess({
    environment: process.env,
    user: {
      uid: process.getuid?.() ?? NO_ID,
      gid: process.getgid?.() ?? NO_ID,
    },
    migrationsFolder: MIGRATIONS_FOLDER,
    version: packageVersion(),
    errors: process.stderr,
    onStopRequest: (stop) => {
      for (const signal of STOP_SIGNALS) {
        process.once(signal, stop);
      }
    },
  });
}
