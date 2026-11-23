import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listFiles } from '#harness/architecture/files';
import { formatFinding } from '#harness/architecture/finding';
import { linkFindings } from '#harness/documents/links';
import type { Host } from '#harness/gate/host';
import { TOOLS } from '#harness/gate/tools';
import { readStructure } from '#harness/shared/structure';

const DOCUMENT = '.md';
const CONFIG = 'harness/configs/markdownlint.json';

/**
 * The documents git sees: tracked, or new and not ignored. A document that
 * exists on one machine only is not judged, so the verdict is the same
 * everywhere.
 */
function documentsOf(files: readonly string[]): string[] {
  const { excluded } = readStructure();
  return files
    .filter((path) => path.endsWith(DOCUMENT))
    .filter((path) => !excluded.some((prefix) => path.startsWith(prefix)));
}

/** Lints the documents and checks that every link in them leads somewhere. */
export function runDocuments(host: Host): number {
  const files = listFiles(host.root).filter((path) =>
    existsSync(join(host.root, path)),
  );
  const paths = documentsOf(files);
  const linted = host.start({
    nodeOptions: [],
    script: TOOLS['markdownlint-cli2'],
    arguments: ['--config', CONFIG, ...paths.map((path) => `:${path}`)],
  });
  const documents = paths.map((path) => ({
    path,
    text: readFileSync(join(host.root, path), 'utf8'),
  }));
  const findings = linkFindings(documents, new Set(files));
  for (const finding of findings) {
    host.print(formatFinding(finding));
  }
  host.print(`documents: ${String(findings.length)} dead link(s)`);
  return linted && findings.length === 0 ? 0 : 1;
}
