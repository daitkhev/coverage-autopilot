import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { Cells } from '#commands/columns';
import type { CommandIo } from '#commands/command-io';
import { percentText, shortCommit } from '#commands/words';
import { ageWords } from '#theme/moments';

/** The name a person types for a repository: `owner/name`. */
export function repositoryName(repository: Repository): string {
  return `${repository.owner}/${repository.name}`;
}

/** What is worth knowing beside the numbers: the head moved, or a scan runs. */
function notesOf(repository: Repository): string {
  const notes: string[] = [];
  if (repository.outdated) {
    notes.push('outdated');
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
    shortCommit(snapshot.commitSha),
    `scanned ${ageWords(snapshot.capturedAt, io.session.now())} ago`,
    notesOf(repository),
  ];
}
