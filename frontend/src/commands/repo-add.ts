import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { printAnswer } from '#commands/output';
import { repositoryCells } from '#commands/repository-words';

/** `repo add <url>`: connects a repository and prints it. */
export async function repoAdd(
  command: Command<'repo add'>,
  io: CommandIo,
): Promise<number> {
  const answer = await io.session.api.connectRepository({ url: command.url });
  return printAnswer(
    answer,
    (repository) => alignedRows([repositoryCells(repository, io)]),
    io,
  );
}
