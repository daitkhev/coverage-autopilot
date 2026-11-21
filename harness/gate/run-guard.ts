import { readFileSync } from 'node:fs';

import { isInSomePlace } from '#harness/architecture/patterns';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';
import { type FrozenPolicy, isFrozen } from '#harness/shared/frozen';
import { HarnessError } from '#harness/shared/harness.error';
import { isRecord } from '#harness/shared/json';

/** The names under which the API of GitHub gives one changed file. */
const NAME = 'filename';
const NAME_BEFORE = 'previous_filename';

/** The files of a change, sorted by what judges them. */
export interface Change {
  readonly policy: readonly string[];
  readonly other: readonly string[];
}

function unreadable(line: string): HarnessError {
  return new HarnessError(
    `The list of files has a line it cannot read: ${line}`,
  );
}

/**
 * The names of one changed file. A file that was renamed has two, and it
 * counts under both, so a file of the policy does not leave it by a move.
 */
function namesOf(line: string): string[] {
  let file: unknown;
  try {
    file = JSON.parse(line);
  } catch {
    throw unreadable(line);
  }
  if (!isRecord(file) || typeof file[NAME] !== 'string') {
    throw unreadable(line);
  }
  const before = file[NAME_BEFORE];
  return typeof before === 'string' ? [file[NAME], before] : [file[NAME]];
}

/** Every changed file, each as its names. The text has one file a line. */
export function changedFilesOf(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(namesOf);
}

/** Sorts names into policy and the rest. Some files go with either. */
export function sortChange(
  names: readonly string[],
  policy: FrozenPolicy,
): Change {
  const frozen = names.filter((name) => isFrozen(name, policy));
  const other = names.filter(
    (name) =>
      !isFrozen(name, policy) && !isInSomePlace(name, policy.withPolicy),
  );
  return { policy: frozen, other };
}

/** What the check is started with: the list, and how long it must be. */
function startedWith(arguments_: readonly string[]): [string, number] {
  const [list, expected] = arguments_;
  const count = Number(expected);
  if (list === undefined || expected === '' || !Number.isInteger(count)) {
    throw new HarnessError('usage: guard.ts <list of files> <how many files>');
  }
  return [list, count];
}

function judge(change: Change, host: Host): number {
  const mixed = change.policy.length > 0 && change.other.length > 0;
  if (mixed) {
    host.print(
      [
        ...change.policy.map((name) => `policy: ${name}`),
        ...change.other.map((name) => `other:  ${name}`),
      ].join('\n'),
    );
  }
  host.print(
    mixed
      ? 'guard: a change of the policy and a change of anything else ' +
          'do not land together. Split them into two pull requests.'
      : `guard: passed, ${String(change.policy.length)} file(s) of the ` +
          `policy and ${String(change.other.length)} other file(s)`,
  );
  return mixed ? 1 : 0;
}

/**
 * Judges the list of files of a pull request: red when it touches the
 * policy and something else. The list comes with the number of files the
 * pull request has, and a list that is shorter is not judged at all.
 */
export function runGuard(
  arguments_: readonly string[],
  host: Host,
  policy: FrozenPolicy,
): number {
  return exitCodeOf(host, () => {
    const [list, count] = startedWith(arguments_);
    const files = changedFilesOf(readFileSync(list, 'utf8'));
    if (files.length !== count) {
      throw new HarnessError(
        `guard: the list has ${String(files.length)} of the ` +
          `${String(count)} files of the change. A part is not judged.`,
      );
    }
    return judge(sortChange(files.flat(), policy), host);
  });
}
