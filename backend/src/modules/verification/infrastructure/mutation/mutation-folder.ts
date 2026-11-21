import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MUTATION_FOLDER } from '#verification/infrastructure/mutation/stryker-configuration';

/**
 * Makes the folder of the run anew, then writes each file into it. Code of
 * the repository may have left anything at its place, a link included, so
 * whatever is there is removed and never followed, and a file is only
 * ever created, never written through.
 */
export function prepareFolder(
  root: string,
  files: Readonly<Record<string, string>>,
): void {
  const folder = join(root, MUTATION_FOLDER);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder);
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(root, file), content, { flag: 'wx' });
  }
}
