import { ServiceTimeoutError } from '#api/service-timeout-error';
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
import { repoThreshold } from '#commands/repo-threshold';
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
  'repo threshold': repoThreshold,
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

/** The sentence for a service that does not answer, or not in time. */
function silenceOf(error: unknown): string | undefined {
  if (error instanceof ServiceUnreachableError) {
    return `The service does not answer on ${error.socketPath}.`;
  }
  return error instanceof ServiceTimeoutError ? error.message : undefined;
}

/**
 * Runs work over the service and gives its exit code. A service that
 * does not answer, or does not answer in time, is said here once, in one
 * sentence, for every command and for the reach before it; any other
 * fault is not caught, so it is not mistaken for an answer.
 */
export async function overService(
  err: (line: string) => void,
  work: () => Promise<number>,
): Promise<number> {
  try {
    return await work();
  } catch (error: unknown) {
    const said = silenceOf(error);
    if (said === undefined) {
      throw error;
    }
    err(said);
    return EXIT_CODE.failed;
  }
}

/** Runs one command and gives its exit code, as `overService` says. */
export async function runCommand(
  command: Command,
  io: CommandIo,
): Promise<number> {
  return overService(io.err, async () => dispatch(command, io));
}
