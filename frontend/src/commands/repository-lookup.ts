import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { SnapshotSummary } from '@coverage-autopilot/api-contracts/snapshots';

import type { CommandIo } from '#commands/command-io';
import { answeredValue } from '#commands/output';
import { repositoryName } from '#commands/repository-words';
import { PROGRAM } from '#commands/words';

/**
 * The connected repository a person named as `owner/name`, found in the
 * list of repositories, or nothing once it was said why there is none.
 */
export async function findRepository(
  name: string,
  io: CommandIo,
): Promise<Repository | undefined> {
  const list = answeredValue(await io.session.api.listRepositories(), io);
  if (list === undefined) {
    return undefined;
  }
  const found = list.items.find(
    (repository) => repositoryName(repository) === name,
  );
  if (found === undefined) {
    io.err(
      `No repository ${name} is connected; ` +
        `connect it with ${PROGRAM} repo add <url>.`,
    );
  }
  return found;
}

/** A repository with its latest snapshot. */
interface Scanned {
  readonly repository: Repository;
  readonly snapshot: SnapshotSummary;
}

/**
 * The repository a person named with its latest snapshot, which files
 * are listed from and improved from, or nothing once it was said why.
 */
export async function findScanned(
  name: string,
  io: CommandIo,
): Promise<Scanned | undefined> {
  const repository = await findRepository(name, io);
  if (repository?.latestSnapshot === null) {
    io.err(
      `${name} has no snapshot yet; scan it first with ${PROGRAM} scan ${name}.`,
    );
  }
  const snapshot = repository?.latestSnapshot ?? null;
  return repository === undefined || snapshot === null
    ? undefined
    : { repository, snapshot };
}

/** The latest snapshot of the repository a person named, as `findScanned`. */
export async function findLatestSnapshot(
  name: string,
  io: CommandIo,
): Promise<SnapshotSummary | undefined> {
  return (await findScanned(name, io))?.snapshot;
}
