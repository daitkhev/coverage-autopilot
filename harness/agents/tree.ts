import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

import { listFiles } from '#harness/architecture/files';

function digestOf(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** What a file is right now: its content, the target of a link, or gone. */
function stateOf(path: string): string {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry === undefined) {
    return 'gone';
  }
  if (entry.isSymbolicLink()) {
    return `link ${readlinkSync(path)}`;
  }
  return `file ${digestOf(readFileSync(path))}`;
}

/**
 * A name for the tree as it stands: every file git sees, with what is in
 * it. The gate gives the same verdict to two trees with the same name, so
 * a tree is judged once.
 */
export function fingerprintOf(root: string): string {
  const files = listFiles(root).map(
    (path) => `${path}\0${stateOf(join(root, path))}`,
  );
  return digestOf(files.join('\n'));
}
