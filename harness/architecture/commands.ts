import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  BASELINE,
  formatLists,
  listFindings,
  migrationFindings,
  parseLists,
  readBaseline,
} from '#harness/architecture/baseline';
import { compareFindings, type Finding } from '#harness/architecture/finding';
import { isCommit, isNoCommit, showFile } from '#harness/architecture/git';
import { limitFindings, LIMITS } from '#harness/architecture/limit-changes';
import { type Lists, listsOf } from '#harness/architecture/lists';
import { runRatchet } from '#harness/architecture/run';
import { HarnessError } from '#harness/shared/harness.error';
import { isRecord, type JsonRecord } from '#harness/shared/json';
import { readStructure } from '#harness/shared/structure';

/** What a command of the ratchet found, and what it has to say. */
export interface Outcome {
  readonly findings: readonly Finding[];
  readonly notes: readonly string[];
}

/** The baseline of a tree, or why it cannot be read. */
function baselineOf(root: string): Lists | HarnessError | undefined {
  try {
    return readBaseline(root);
  } catch (error) {
    if (error instanceof HarnessError) {
      return error;
    }
    throw error;
  }
}

/** The rules and the lists: any finding fails, and so does no baseline. */
export function checkTree(root: string): Outcome {
  const current = listsOf(root, readStructure());
  const findings = [
    ...runRatchet(root),
    ...listFindings(baselineOf(root), current),
  ];
  return { findings: findings.sort(compareFindings), notes: [] };
}

/**
 * Records the lists of the tree. Refuses while a rule has a finding, and
 * never accepts a recorded migration that changed or is gone. A baseline
 * that cannot be read is written anew, as a missing one is.
 */
export function writeBaseline(root: string): Outcome {
  const current = listsOf(root, readStructure());
  const found = baselineOf(root);
  const recorded = found instanceof HarnessError ? undefined : found;
  const findings = [
    ...runRatchet(root),
    ...(recorded === undefined ? [] : migrationFindings(recorded, current)),
  ];
  if (findings.length > 0) {
    return { findings, notes: ['Nothing was written.'] };
  }
  const text = formatLists(current);
  const path = join(root, BASELINE);
  // The file is compared and not what was read from it: a baseline of an
  // older shape reads the same and is still written anew.
  const same = existsSync(path) && readFileSync(path, 'utf8') === text;
  if (!same) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  const note = same ? 'is up to date.' : 'was written.';
  return { findings: [], notes: [`${BASELINE} ${note}`] };
}

function recordOf(text: string, path: string): JsonRecord {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new HarnessError(`${path} must hold a JSON object.`);
  }
  return parsed;
}

function migrationChanges(root: string, base: string): Outcome {
  const text = showFile(root, base, BASELINE);
  if (text === undefined) {
    return { findings: [], notes: [`${base} has no ${BASELINE}.`] };
  }
  const current = listsOf(root, readStructure());
  return { findings: migrationFindings(parseLists(text), current), notes: [] };
}

function limitChanges(root: string, base: string): Outcome {
  const before = showFile(root, base, LIMITS);
  const path = join(root, LIMITS);
  if (before === undefined || !existsSync(path)) {
    const missing = before === undefined ? base : 'This tree';
    return { findings: [], notes: [`${missing} has no ${LIMITS}.`] };
  }
  const now = recordOf(readFileSync(path, 'utf8'), LIMITS);
  return { findings: limitFindings(recordOf(before, LIMITS), now), notes: [] };
}

/**
 * Compares the tree with a commit it grew from. A recorded migration may not
 * change and a limit may not get looser. A base that is not there is an
 * error: a comparison that did not run has failed.
 */
export function compareWithBase(root: string, base: string): Outcome {
  if (isNoCommit(base)) {
    return { findings: [], notes: ['There is no base: nothing to compare.'] };
  }
  if (!isCommit(root, base)) {
    throw new HarnessError(`"${base}" is not a commit of this repository.`);
  }
  const parts = [migrationChanges(root, base), limitChanges(root, base)];
  return {
    findings: parts.flatMap((part) => part.findings).sort(compareFindings),
    notes: parts.flatMap((part) => part.notes),
  };
}
