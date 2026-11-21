import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { listFiles } from '#harness/architecture/files';

/**
 * Gives a copy of the files git sees, and removes it afterwards. A tool
 * that reads a folder reads the copy, so a file git ignores on one machine
 * does not change the verdict. A link is left out: what it leads to is in
 * the copy by its own path.
 */
export function withCopyOfTree<Verdict>(
  root: string,
  use: (copy: string) => Verdict,
): Verdict {
  const copy = mkdtempSync(join(tmpdir(), 'harness-tree-'));
  try {
    for (const path of listFiles(root)) {
      const from = join(root, path);
      if (lstatSync(from, { throwIfNoEntry: false })?.isFile() === true) {
        mkdirSync(dirname(join(copy, path)), { recursive: true });
        copyFileSync(from, join(copy, path));
      }
    }
    return use(copy);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
