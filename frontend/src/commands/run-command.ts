import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { approve } from '#commands/approve';
import { cancel } from '#commands/cancel';
import type { Command, CommandName } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { doctor } from '#commands/doctor';
import { files } from '#commands/files';
import { improve } from '#commands/improve';
import { list } from '#commands/list';
import { patch } from '#commands/patch';
import { repoAdd } from '#commands/repo-add';
import { repoCheck } from '#commands/repo-check';
import { repoList } from '#commands/repo-list';
import { scan } from '#commands/scan';
import { status } from '#commands/status';

/** The function that runs each command, by its name. */
const RUNNERS: {
  readonly [Name in CommandName]: (
    command: Command<Name>,
    io: CommandIo,
  ) => Promise<number>;
} = {
  'repo add': repoAdd,
  'repo list': repoList,
  'repo check': repoCheck,
  scan,
  files,
  improve,
  list,
  status,
  patch,
  approve,
  cancel,
  doctor,
};

function dispatch<Name extends CommandName>(
  command: Command<Name>,
  io: CommandIo,
): Promise<number> {
  const run: (command: Command<Name>, io: CommandIo) => Promise<number> =
    RUNNERS[command.name];
  return run(command, io);
}

/**
 * Runs one command and gives its exit code. A service that does not
 * answer is said here once, in one sentence, for every command; any other
 * fault is not caught, so it is not mistaken for an answer.
 */
export async function runCommand(
  command: Command,
  io: CommandIo,
): Promise<number> {
  try {
    return await dispatch(command, io);
  } catch (error: unknown) {
    if (!(error instanceof ServiceUnreachableError)) {
      throw error;
    }
    io.err(`The service does not answer on ${error.socketPath}.`);
    return EXIT_CODE.failed;
  }
}
