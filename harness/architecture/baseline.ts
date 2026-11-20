import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Finding } from '#harness/architecture/finding';
import type { Lists } from '#harness/architecture/lists';
import { HarnessError } from '#harness/shared/harness.error';
import { isRecord, isStringList, type JsonRecord } from '#harness/shared/json';

/** Where the baseline is, from the root of the tree. */
export const BASELINE = 'harness/baseline.json';

const SCHEMA = 1;
const INDENT = 2;
const WRITE_IT = 'Record it with `npm run ratchet:write`.';

/** The text of a baseline. The same lists always give the same text. */
export function formatLists(lists: Lists): string {
  const file = {
    schema: SCHEMA,
    lists: { contracts: lists.contracts, migrations: lists.migrations },
  };
  return `${JSON.stringify(file, null, INDENT)}\n`;
}

function entriesAt(lists: JsonRecord, key: string): [string, unknown][] {
  const value = lists[key];
  if (!isRecord(value)) {
    throw new HarnessError(`${BASELINE}: "${key}" must be an object.`);
  }
  return Object.entries(value);
}

function contractsIn(lists: JsonRecord): Record<string, string[]> {
  return Object.fromEntries(
    entriesAt(lists, 'contracts').map(([module, names]) => {
      if (!isStringList(names)) {
        throw new HarnessError(`${BASELINE}: "${module}" must list names.`);
      }
      return [module, names];
    }),
  );
}

function migrationsIn(lists: JsonRecord): Record<string, string> {
  return Object.fromEntries(
    entriesAt(lists, 'migrations').map(([path, hash]) => {
      if (typeof hash !== 'string') {
        throw new HarnessError(`${BASELINE}: "${path}" must have a hash.`);
      }
      return [path, hash];
    }),
  );
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HarnessError(`${BASELINE} is not JSON.`);
  }
}

/** Reads the text of a baseline. A file of another shape is an error. */
export function parseLists(text: string): Lists {
  const file = jsonOf(text);
  const lists = isRecord(file) ? file['lists'] : undefined;
  if (!isRecord(file) || file['schema'] !== SCHEMA || !isRecord(lists)) {
    throw new HarnessError(`${BASELINE} must have "schema": 1 and "lists".`);
  }
  return { contracts: contractsIn(lists), migrations: migrationsIn(lists) };
}

/** The baseline of a tree. One that cannot be read is an error. */
export function readBaseline(root: string): Lists | undefined {
  const path = join(root, BASELINE);
  return existsSync(path) ? parseLists(readFileSync(path, 'utf8')) : undefined;
}

function at(rule: string, path: string, detail: string): Finding {
  return { rule, path, line: 1, detail };
}

/**
 * Recorded migrations that are gone or are no longer what was recorded.
 * No command of the ratchet accepts one: a migration is never edited.
 */
export function migrationFindings(recorded: Lists, current: Lists): Finding[] {
  return Object.entries(recorded.migrations).flatMap(([path, hash]) => {
    const now = current.migrations[path];
    if (now === hash) {
      return [];
    }
    const detail =
      now === undefined
        ? 'A recorded migration was removed.'
        : 'A recorded migration was changed. Write a new migration instead.';
    return [at('recorded-migration', path, detail)];
  });
}

function difference(left: readonly string[], right: readonly string[]) {
  return left.filter((name) => !right.includes(name));
}

function contractFindings(recorded: Lists, current: Lists): Finding[] {
  const modules = new Set([
    ...Object.keys(recorded.contracts),
    ...Object.keys(current.contracts),
  ]);
  return [...modules].sort().flatMap((module) => {
    const before = recorded.contracts[module] ?? [];
    const now = current.contracts[module] ?? [];
    const added = difference(now, before);
    const removed = difference(before, now);
    if (added.length === 0 && removed.length === 0) {
      return [];
    }
    const detail =
      `The contracts of ${module} changed: ` +
      `added [${added.join(', ')}], removed [${removed.join(', ')}]. `;
    return [at('baseline', BASELINE, detail + WRITE_IT)];
  });
}

function newMigrations(recorded: Lists, current: Lists): Finding[] {
  return Object.keys(current.migrations)
    .filter((path) => recorded.migrations[path] === undefined)
    .map((path) =>
      at('baseline', path, `This migration is not recorded. ${WRITE_IT}`),
    );
}

/**
 * Where the tree and its baseline disagree. A baseline that is missing or
 * cannot be read is a finding.
 */
export function listFindings(
  recorded: Lists | HarnessError | undefined,
  current: Lists,
): Finding[] {
  if (recorded === undefined) {
    return [at('baseline', BASELINE, `There is no baseline. ${WRITE_IT}`)];
  }
  if (recorded instanceof HarnessError) {
    return [at('baseline', BASELINE, `${recorded.message} ${WRITE_IT}`)];
  }
  return [
    ...contractFindings(recorded, current),
    ...newMigrations(recorded, current),
    ...migrationFindings(recorded, current),
  ];
}
