import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { printAnswer } from '#commands/output';
import { findRepository } from '#commands/repository-lookup';
import { thresholdCells } from '#commands/repository-words';

/**
 * `repo threshold <repo> <percent>`: gives a repository a percent of its
 * own, or `default` for the one of the service, and prints the threshold
 * its files are judged by from now on. The service says whether the
 * percent is in range.
 */
export async function repoThreshold(
  command: Command<'repo threshold'>,
  io: CommandIo,
): Promise<number> {
  const repository = await findRepository(command.repository, io);
  if (repository === undefined) {
    return EXIT_CODE.failed;
  }
  const answer = await io.session.api.changeThreshold(repository.id, {
    percentage: command.percentage,
  });
  return printAnswer(
    answer,
    (changed) => alignedRows([thresholdCells(changed)]),
    io,
  );
}
