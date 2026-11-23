import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { printAnswer } from '#commands/output';
import { findRepository } from '#commands/repository-lookup';
import { installCells } from '#commands/repository-words';

/**
 * `repo trust <repo> <mode>`: chooses how the packages of a repository are
 * installed from its next copy, or `default` for the mode of the service,
 * and prints the mode in effect. `trusted` lets the code of the repository
 * and of its packages run while the install has the network.
 */
export async function repoTrust(
  command: Command<'repo trust'>,
  io: CommandIo,
): Promise<number> {
  const repository = await findRepository(command.repository, io);
  if (repository === undefined) {
    return EXIT_CODE.failed;
  }
  const answer = await io.session.api.changeInstallMode(repository.id, {
    mode: command.mode,
  });
  return printAnswer(
    answer,
    (changed) => alignedRows([installCells(changed)]),
    io,
  );
}
