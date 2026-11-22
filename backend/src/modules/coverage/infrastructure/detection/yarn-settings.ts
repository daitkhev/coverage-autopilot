import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import {
  hasFile,
  readText,
} from '#coverage/infrastructure/detection/copy-text';
import {
  keyLinesOf,
  unquoted,
} from '#coverage/infrastructure/detection/indented-keys';
import { unsupported } from '#coverage/infrastructure/detection/runner-choice';

const SETTINGS = '.yarnrc.yml';

/**
 * The settings yarn reads instead, written by the service at the root of
 * the copy. A patch adds only test files, so it never holds this one.
 */
export const CLEAN_SETTINGS = '.coverage-autopilot-yarnrc.yml';

/**
 * The settings that load code of the repository: a program of yarn,
 * plugins, and the constraints yarn 4 checks while it installs. The others
 * stay, since some change how the lockfile resolves.
 */
const DROPPED = new Set(['yarnPath', 'plugins', 'enableConstraintsChecks']);

/** A blank line or a comment, which belongs to no setting. */
const NEUTRAL = /^\s*(?:#.*)?$/u;

/** An indented line goes on the setting above it. */
const INDENT = ' ';

/** A setting at the top: a plain name, maybe quoted, and its colon. */
const SETTING = /^(?<key>[A-Za-z]\w*|"[A-Za-z]\w*"|'[A-Za-z]\w*'):(?: |$)/u;

const LINKER = 'nodeLinker';

const NODE_MODULES = 'node-modules';

const PNPM_LINKER = 'pnpm';

type Kind = 'neutral' | 'indented' | 'setting' | 'unreadable';

function kindOf(line: string): Kind {
  if (NEUTRAL.test(line)) {
    return 'neutral';
  }
  if (line.startsWith(INDENT)) {
    return 'indented';
  }
  return SETTING.test(line) ? 'setting' : 'unreadable';
}

function isDropped(line: string): boolean {
  return DROPPED.has(unquoted(SETTING.exec(line)?.groups?.['key'] ?? ''));
}

/**
 * The lines without those of a dropped setting, or the number of the
 * first line the service does not read. YAML has more forms than a file
 * of settings of yarn uses, and in one of them a dropped setting could
 * hide, such as a mapping indented as a whole.
 */
function cleanedLines(lines: readonly string[]): string[] | number {
  const kept: string[] = [];
  let dropping = false;
  let started = false;
  for (const [index, line] of lines.entries()) {
    const kind = kindOf(line);
    if (kind === 'unreadable' || (kind === 'indented' && !started)) {
      return index + 1;
    }
    if (kind === 'setting') {
      dropping = isDropped(line);
      started = true;
    }
    kept.push(...(dropping ? [] : [line]));
  }
  return kept;
}

/** yarn 2 and later install with Plug'n'Play unless told otherwise. */
function linkerRefusal(text: string): UnsupportedProject | null {
  const linker = keyLinesOf(text).find(
    ({ path }) => path.length === 1 && path[0] === LINKER,
  )?.value;
  if (linker === NODE_MODULES) {
    return null;
  }
  if (linker === PNPM_LINKER) {
    return unsupported(
      'unsupported_package_manager',
      `${SETTINGS} sets ${LINKER} to ${PNPM_LINKER}, and only ` +
        `${LINKER}: ${NODE_MODULES} is supported.`,
    );
  }
  const setting =
    linker === undefined || linker === null
      ? `sets no ${LINKER}`
      : `sets ${LINKER} to ${linker}`;
  return unsupported(
    'plug_and_play',
    `${SETTINGS} ${setting}, so yarn installs with Plug'n'Play, whose ` +
      `packages only its own loader finds. Only ${LINKER}: ` +
      `${NODE_MODULES} is supported.`,
  );
}

function unreadable(where: string): UnsupportedProject {
  return unsupported(
    'install_runs_code',
    `The service does not read ${where}, so it cannot tell that no ` +
      'setting there loads code of the repository.',
  );
}

/**
 * Whatever code of the repository left at the place is removed first. The
 * line break that ended a dropped setting is put back at the end.
 */
function writeClean(root: string, lines: readonly string[]): void {
  const path = join(root, CLEAN_SETTINGS);
  rmSync(path, { recursive: true, force: true });
  writeFileSync(path, `${lines.join('\n').trimEnd()}\n`, { flag: 'wx' });
}

/**
 * Writes the settings of the repository without those that load its
 * code, for yarn to read instead, or refuses a project whose settings
 * keep the packages out of `node_modules` or cannot be read.
 */
export function cleanSettingsIn(root: string): UnsupportedProject | null {
  const text = readText(root, SETTINGS);
  if (text === null && hasFile(root, SETTINGS)) {
    return unreadable(`${SETTINGS}, which is not a plain file`);
  }
  const refusal = linkerRefusal(text ?? '');
  const lines = cleanedLines((text ?? '').split(/\r?\n/u));
  if (refusal !== null || typeof lines === 'number') {
    return refusal ?? unreadable(`line ${String(lines)} of ${SETTINGS}`);
  }
  writeClean(root, lines);
  return null;
}
