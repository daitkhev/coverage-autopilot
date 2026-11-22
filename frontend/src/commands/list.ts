import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { improvementCells } from '#commands/improvement-words';
import { answeredValue, printResult } from '#commands/output';
import { repositoryName } from '#commands/repository-words';

/**
 * `list`: one line for each improvement of every repository. An
 * improvement names its repository by id, so the list of repositories
 * gives the names a person types; one it lacks keeps its id.
 */
export async function list(
  _command: Command<'list'>,
  io: CommandIo,
): Promise<number> {
  const { api } = io.session;
  const improvements = answeredValue(await api.listImprovements(), io);
  if (improvements === undefined) {
    return EXIT_CODE.failed;
  }
  const repositories = answeredValue(await api.listRepositories(), io);
  if (repositories === undefined) {
    return EXIT_CODE.failed;
  }
  const names = new Map(
    repositories.items.map((each) => [each.id, repositoryName(each)]),
  );
  return printResult(
    improvements,
    (value) =>
      alignedRows(
        value.items.map((improvement) => [
          names.get(improvement.repositoryId) ?? improvement.repositoryId,
          ...improvementCells(improvement, io),
        ]),
      ),
    io,
  );
}
