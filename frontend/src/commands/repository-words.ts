import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { Cells } from '#commands/columns';
import type { CommandIo } from '#commands/command-io';
import { percentText } from '#commands/words';
import { failingTestsWords, percentWords } from '#theme/counts';
import { ageWords } from '#theme/moments';
import { repositoryName, shortHash } from '#theme/names';

/** The name a person types for a repository, as the screens show it. */
export { repositoryName };

/**
 * What is worth knowing beside the numbers: its install runs its code, the
 * head moved, tests failed in the sandbox at the scan, or a scan runs.
 */
function notesOf(repository: Repository): string {
  const notes: string[] = [];
  if (repository.install.mode === 'trusted') {
    notes.push('trusted install');
  }
  if (repository.outdated) {
    notes.push('outdated');
  }
  const failing = failingTestsWords(repository.latestSnapshot?.tests ?? null);
  if (failing !== null) {
    notes.push(failing);
  }
  if (repository.activeScanId !== null) {
    notes.push(`scanning (${repository.activeScanId})`);
  }
  return notes.join(', ');
}

/**
 * One repository in a line: its name, its coverage by the counter of its
 * threshold, the files below it, and its branch, commit and scan.
 */
export function repositoryCells(repository: Repository, io: CommandIo): Cells {
  const name = repositoryName(repository);
  const snapshot = repository.latestSnapshot;
  if (snapshot === null) {
    return [
      name,
      'not scanned',
      '',
      repository.defaultBranch,
      '',
      '',
      notesOf(repository),
    ];
  }
  return [
    name,
    percentText(snapshot.totals[snapshot.threshold.metric]),
    `${String(snapshot.files.below)} below`,
    repository.defaultBranch,
    shortHash(snapshot.commitSha),
    `scanned ${ageWords(snapshot.capturedAt, io.session.now())} ago`,
    notesOf(repository),
  ];
}

/**
 * The threshold the files of a repository are judged by, and whether it
 * is its own or the default of the service.
 */
export function thresholdCells(repository: Repository): Cells {
  const { metric, percentage, isDefault } = repository.threshold;
  return [
    repositoryName(repository),
    `threshold ${percentWords(percentage)} of ${metric}`,
    isDefault ? 'default' : 'own',
  ];
}

/**
 * How the packages of a repository are installed, and whether that is its
 * own choice or the default of the service.
 */
export function installCells(repository: Repository): Cells {
  const { mode, isDefault } = repository.install;
  return [
    repositoryName(repository),
    `install ${mode}`,
    isDefault ? 'default' : 'own',
  ];
}
