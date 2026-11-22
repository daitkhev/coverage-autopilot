import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { printAnswer } from '#commands/output';
import { repositoryCells } from '#commands/repository-words';

/** `repo list`: one line for each connected repository. */
export async function repoList(
  _command: Command<'repo list'>,
  io: CommandIo,
): Promise<number> {
  const answer = await io.session.api.listRepositories();
  return printAnswer(
    answer,
    (list) =>
      alignedRows(
        list.items.map((repository) => repositoryCells(repository, io)),
      ),
    io,
  );
}
