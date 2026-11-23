import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { arch, platform } from 'node:os';
import { join } from 'node:path';

import { HarnessError } from '#harness/shared/harness.error';
import {
  type OutsideTool,
  readOutsideTool,
} from '#harness/shared/outside-tools';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

/** Puts what an address gives into a file, and says whether it did. */
export type Download = (url: string, to: string) => boolean;

/** The path of the program of a tool, by the name of the tool. */
export type ProgramOf = (name: string) => string;

/** Where the unpacked tools are kept. `npm ci` empties it with the rest. */
const KEPT = join(REPOSITORY_ROOT, 'node_modules/.cache/harness-tools');

/** Downloads over https and nothing else, and follows a redirect. */
function download(url: string, to: string): boolean {
  const result = spawnSync(
    'curl',
    ['--fail', '--silent', '--show-error', '--location'].concat([
      '--proto',
      '=https',
      '--output',
      to,
      url,
    ]),
    { stdio: 'inherit' },
  );
  return result.status === 0;
}

function checksumOf(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Downloads the archive, holds it to its checksum, and takes the program. */
function unpackInto(folder: string, tool: OutsideTool, fetch: Download): void {
  const archive = join(folder, 'archive');
  if (!fetch(tool.url, archive)) {
    throw new HarnessError(`${tool.name}: no download from ${tool.url}`);
  }
  const checksum = checksumOf(archive);
  if (checksum !== tool.sha256) {
    throw new HarnessError(
      `${tool.name}: the archive is not the one the policy names. ` +
        `Its checksum is ${checksum}.`,
    );
  }
  const unpacked = spawnSync('tar', [
    '-xzf',
    archive,
    '-C',
    folder,
    tool.program,
  ]);
  rmSync(archive);
  if (unpacked.status !== 0 || !existsSync(join(folder, tool.program))) {
    throw new HarnessError(
      `${tool.name}: the archive holds no ${tool.program}.`,
    );
  }
}

/**
 * The path of the program of a tool. It is downloaded once, and only an
 * archive with the checksum of the policy is unpacked. Another version or
 * another checksum is another folder, so an old program is never taken
 * for a new one.
 */
export function programOf(
  tool: OutsideTool,
  kept: string,
  fetch: Download,
): string {
  const folder = join(kept, `${tool.name}-${tool.version}-${tool.sha256}`);
  const program = join(folder, tool.program);
  if (existsSync(program)) {
    return program;
  }
  mkdirSync(kept, { recursive: true });
  const work = mkdtempSync(join(kept, 'unpack-'));
  try {
    unpackInto(work, tool, fetch);
    renameSync(work, folder);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return program;
}

/** The program of a tool of `tools.json`, for the machine this runs on. */
export function outsideProgram(name: string): string {
  const tool = readOutsideTool(name, `${platform()}-${arch()}`);
  return programOf(tool, KEPT, download);
}
