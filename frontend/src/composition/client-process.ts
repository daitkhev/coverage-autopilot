import { runScreens, type Terminal } from '#app/interactive';
import {
  doorOf,
  type ServiceDoor,
  type ServiceSetting,
  sessionOf,
} from '#app/service-door';
import { reachLinesOf, STEP_WORDS } from '#app/service-reach-words';
import { HELP_TEXT } from '#commands/command-grammar';
import { EXIT_CODE } from '#commands/command-io';
import { type CommandLine, parseCommandLine } from '#commands/command-line';
import { overService, runCommand } from '#commands/run-command';
import {
  type Environment,
  serviceSettingOf,
  showsColour,
  showsUnicode,
} from '#composition/client-environment';
import {
  type ProcessSignals,
  type SignalWatch,
  watchSignals,
} from '#composition/process-signals';

/** Everything of the process the client uses, read by the entry file. */
export interface ClientProcess {
  /** The arguments after the program and its file. */
  readonly argv: readonly string[];
  readonly environment: Environment;
  /** The program and the entry file of the service this client starts. */
  readonly service: ServiceSetting['command'];
  /** The terminal, when both ends of the process are one. */
  readonly terminal: Terminal | undefined;
  /** Standard output: the result, and nothing else. */
  readonly out: (line: string) => void;
  /** Standard error: progress and diagnostics. */
  readonly err: (line: string) => void;
  /** Where the signals of the process arrive: the process itself. */
  readonly signals: ProcessSignals;
}

type Line<Kind extends CommandLine['kind']> = Extract<
  CommandLine,
  { readonly kind: Kind }
>;

/** The way to the service of one run, and the way out of it at once. */
interface Run {
  readonly door: ServiceDoor;
  /** Aborted by a signal. */
  readonly leave: AbortSignal;
}

/** The screens need a terminal. Without one the help says what works. */
async function showScreens(
  line: Line<'interactive'>,
  process: ClientProcess,
  run: Run,
): Promise<number> {
  if (process.terminal === undefined) {
    process.err(HELP_TEXT);
    return EXIT_CODE.wrongLine;
  }
  const farewell = await runScreens({
    terminal: process.terminal,
    theme: {
      colour: showsColour(process.environment) && line.flags.colour,
      unicode: showsUnicode(process.environment),
      animation: true,
    },
    reach: run.door.reach,
    sessionOf,
    leave: run.leave,
  });
  if (farewell !== undefined) {
    process.out(farewell);
  }
  return EXIT_CODE.done;
}

/**
 * One command over the service, which is reached first. A service that
 * does not answer the reach is said as one that does not answer the
 * command.
 */
async function runOne(
  line: Line<'command'>,
  process: ClientProcess,
  { door }: Run,
): Promise<number> {
  return overService(process.err, async () => {
    const reached = await door.reach((step) => {
      process.err(STEP_WORDS[step]);
    });
    if (reached.outcome !== 'ready') {
      reachLinesOf(reached).forEach(process.err);
      return EXIT_CODE.failed;
    }
    return runCommand(line.command, {
      session: sessionOf(reached.api),
      out: process.out,
      err: process.err,
      pause: door.pause,
      json: line.flags.json,
      unicode: showsUnicode(process.environment),
    });
  });
}

/** Leaves what the run started, and then stops watching its signals. */
async function leaveAll(run: Run, signals: SignalWatch): Promise<void> {
  try {
    await run.door.leave();
  } finally {
    signals.end();
  }
}

/**
 * What needs the service, and leaves it again whatever happens: when it
 * ends, or at once on a signal, whose code the process then ends with. A
 * shared service is left running either way.
 */
async function withService(
  line: Line<'interactive' | 'command'>,
  process: ClientProcess,
): Promise<number> {
  const setting = serviceSettingOf(process.environment, process.service);
  const signals = watchSignals(process.signals);
  const run: Run = {
    door: doorOf(setting, { isolated: line.flags.isolated }),
    leave: signals.leave,
  };
  try {
    return await Promise.race([
      line.kind === 'command'
        ? runOne(line, process, run)
        : showScreens(line, process, run),
      signals.code,
    ]);
  } finally {
    await leaveAll(run, signals);
  }
}

/**
 * One run of the client: the command of its line, or the screens when
 * the line names none. It gives the exit code of the process, and after
 * a signal ends the process itself once it has left what it started.
 */
export async function runClient(process: ClientProcess): Promise<number> {
  const line = parseCommandLine(process.argv);
  switch (line.kind) {
    case 'help':
      process.out(line.text);
      return line.exitCode;
    case 'wrong':
      process.err(line.message);
      process.err(line.usage);
      return line.exitCode;
    default:
      return withService(line, process);
  }
}
