import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, execPath, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  answerEvent,
  initEvent,
  resultEvent,
  streamOf,
} from '#tests/support/generator-stream';
import {
  baselineReport,
  NEW_TESTS,
  patchedReport,
} from '#tests/support/mutation-reports';
import {
  dropContainer,
  holdContainer,
  holdsContainer,
  listedContainers,
} from '#tests/support/played-containers';
import { shippedImageLabel } from '#tests/support/shipped-image';
import { paceOf } from '#tests/support/stand-in-pace';
import {
  coverageReportOf,
  holdsNewTests,
  NEW_TEST_FILE,
} from '#tests/support/widgets-project';

/**
 * A stand-in for the program of the container engine that plays the
 * tools a container would run, started by Node with a folder of its own.
 * It never starts a container and never runs code of the project: for
 * each `run` it takes the working copy the container works in and the
 * command after the image, writes what the tool would write into the
 * copy, and prints what the tool would print. It keeps the containers it
 * plays as `played-containers` describes.
 */

/** One container the engine was asked to run, as the stand-in read it. */
export interface PlayedRun {
  /** The working copy, mounted at its own path and used as the workdir. */
  readonly copy: string;
  readonly command: readonly string[];
  /** The variables of the command, from the file the engine reads them from. */
  readonly variables: Readonly<Record<string, string>>;
}

/** What a tool prints and the code it ends with. */
interface Played {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

type Tool = (run: PlayedRun) => Played;

const RUNS = 'runs.jsonl';
const IMAGE_CALLS = 'image-calls.jsonl';

/** After Node and the path of this file: the folder, then the engine's own. */
const FOLDER_ARGUMENT = 2;

/** After the flag of the file of variables: the file, the image, the command. */
const COMMAND_AFTER_FLAG = 3;

/** What a shell answers for a program it does not find. */
const NOT_FOUND = 127;

/** How often a container whose service died looks whether it was removed. */
const LOOK_AGAIN_MS = 20;

/** Ten minutes of looks, longer than any test. */
const LOOKS_OF_AN_ORPHAN = 30_000;

/** The programs the adapters start by their paths in the copy. */
const COMPILER = 'node_modules/typescript/bin/tsc';
const JEST = 'node_modules/jest/bin/jest.js';
const STRYKER = 'node_modules/@stryker-mutator/core/bin/stryker.js';

/** Jest writes its report as this file in the folder it is given. */
const COVERAGE_FILE = 'coverage-final.json';
const COVERAGE_FOLDER = /^--coverageDirectory=(?<folder>.+)$/u;

/** The variable the CLI logs in with under a subscription. */
const CREDENTIAL_VARIABLE = 'CLAUDE_CODE_OAUTH_TOKEN';

/** How the generator starts the line that names its credential. */
export const LOGIN_LINE = 'debug: logged in with ';

/**
 * The program and the arguments of the engine, for the variable of the
 * service that names it. Node takes `--env-file` for itself even after
 * the script, up to `--`.
 */
export function playingEngine(folder: string): string[] {
  return [execPath, '--', fileURLToPath(import.meta.url), folder];
}

/** What the stand-in in `folder` recorded in the file `name`, in order. */
function recordedIn<Value>(folder: string, name: string): Value[] {
  const path = join(folder, name);
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Value)
    : [];
}

/** The containers the stand-in in `folder` was asked to run, in order. */
export function playedRuns(folder: string): PlayedRun[] {
  return recordedIn(folder, RUNS);
}

/**
 * The arguments of each call that looked at, built or pulled an image,
 * which the stand-in in `folder` was asked, in order.
 */
export function imageCalls(folder: string): string[][] {
  return recordedIn(folder, IMAGE_CALLS);
}

function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** An install leaves the programs the service starts by their paths. */
function installing(programs: readonly string[]): Tool {
  return ({ copy }) => {
    for (const program of programs) {
      write(copy, program, '// The stand-in of an installed program.\n');
    }
    return {
      exitCode: 0,
      stdout: `added ${String(programs.length)} packages\n`,
    };
  };
}

/** A run with coverage writes its report where the service reads it. */
const playJest: Tool = ({ copy, command }) => {
  const folder = command
    .map((argument) => COVERAGE_FOLDER.exec(argument)?.groups?.['folder'])
    .find((found) => found !== undefined);
  if (folder !== undefined) {
    write(copy, join(folder, COVERAGE_FILE), coverageReportOf(copy));
  }
  return { exitCode: 0, stderr: 'Tests: all passed\n' };
};

/** The report goes where the configuration the service wrote names it. */
const playStryker: Tool = ({ copy, command }) => {
  const configuration = JSON.parse(
    readFileSync(join(copy, command.at(-1) ?? ''), 'utf8'),
  ) as { readonly jsonReporter: { readonly fileName: string } };
  const report = holdsNewTests(copy)
    ? patchedReport(copy)
    : baselineReport(copy);
  write(copy, configuration.jsonReporter.fileName, report);
  return { exitCode: 0, stdout: 'INFO Done in 1 second.\n' };
};

/**
 * The CLI writes one test file and reports its run. It also prints the
 * credential it was given, as a careless program might in a line of
 * debug, so a test sees whether the service keeps it out of what it
 * stores and logs.
 */
const playGenerator: Tool = ({ copy, variables }) => {
  write(copy, NEW_TESTS, NEW_TEST_FILE);
  const credential = variables[CREDENTIAL_VARIABLE] ?? '';
  return {
    exitCode: 0,
    stdout: streamOf(
      initEvent(),
      answerEvent(`I will add ${NEW_TESTS}.`),
      resultEvent({ result: `Added ${NEW_TESTS}.` }),
    ),
    stderr: `${LOGIN_LINE}${credential}\n`,
  };
};

/** Each tool by its program, or by the program and its first argument. */
const TOOLS: Readonly<Record<string, Tool>> = {
  'npm ci': installing([COMPILER, JEST]),
  'npm install': installing([STRYKER]),
  [`node ${COMPILER}`]: () => ({ exitCode: 0 }),
  [`node ${JEST}`]: playJest,
  [`node ${STRYKER}`]: playStryker,
  claude: playGenerator,
};

function toolOf(command: readonly string[]): Tool {
  const [program = '', first = ''] = command;
  const tool = TOOLS[`${program} ${first}`] ?? TOOLS[program];
  return (
    tool ?? (() => ({ exitCode: NOT_FOUND, stderr: `${program}: not found\n` }))
  );
}

/** The file the engine reads variables from: `NAME=value` a line. */
function variablesOf(input: string): Record<string, string> {
  return Object.fromEntries(
    input
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const equals = line.indexOf('=');
        return [line.slice(0, equals), line.slice(equals + 1)];
      }),
  );
}

function runOf(args: readonly string[], input: string): PlayedRun {
  return {
    copy: args[args.indexOf('--workdir') + 1] ?? '',
    command: args.slice(args.indexOf('--env-file') + COMMAND_AFTER_FLAG),
    variables: variablesOf(input),
  };
}

/** Records a call about an image, and answers a look at one. */
function playImageCall(folder: string, args: readonly string[]): void {
  appendFileSync(join(folder, IMAGE_CALLS), `${JSON.stringify(args)}\n`);
  if (args[0] === 'image') {
    stdout.write(`${shippedImageLabel(args.at(-1) ?? '')}\n`);
  }
}

/**
 * A container whose service died while it ran goes on, as one with a long
 * command does under a real engine, until it is removed, or for longer
 * than any test runs, so a test that was itself killed leaves no process
 * for long.
 */
function runOn(folder: string, name: string): void {
  let looks = 0;
  const looking = setInterval(() => {
    looks += 1;
    if (!holdsContainer(folder, name) || looks > LOOKS_OF_AN_ORPHAN) {
      clearInterval(looking);
    }
  }, LOOK_AGAIN_MS);
}

/**
 * Records the `run`, keeps its container, plays its tool once the pace
 * of the stand-in passed, and drops the container once the command
 * ended. A container whose service is gone by then plays nothing and
 * runs on.
 */
function play(folder: string, args: readonly string[], input: string): void {
  const service = process.ppid;
  const name = holdContainer(folder, args);
  const run = runOf(args, input);
  appendFileSync(join(folder, RUNS), `${JSON.stringify(run)}\n`);
  setTimeout(() => {
    if (process.ppid !== service) {
      runOn(folder, name);
      return;
    }
    const played = toolOf(run.command)(run);
    dropContainer(folder, name);
    stdout.write(played.stdout ?? '');
    stderr.write(played.stderr ?? '');
    process.exitCode = played.exitCode;
  }, paceOf(folder));
}

/**
 * What the engine answers each call but a run. Every image is there,
 * labelled as one built from the file the service ships for it, so no
 * build or pull is asked, and each call about an image is recorded so a
 * test sees that. A listing names the containers that were not removed,
 * and a removal drops one. Any other call succeeds.
 */
const ANSWERS: Readonly<
  Record<string, (folder: string, args: readonly string[]) => void>
> = {
  image: playImageCall,
  build: playImageCall,
  pull: playImageCall,
  ps: (folder, args) => {
    const names = listedContainers(folder, args).map((name) => `${name}\n`);
    stdout.write(names.join(''));
  },
  rm: (folder, args) => {
    dropContainer(folder, args.at(-1) ?? '');
  },
};

function main(): void {
  const [folder = '', ...args] = argv.slice(FOLDER_ARGUMENT);
  const input = readFileSync(0, 'utf8');
  if (args[0] === 'run') {
    play(folder, args, input);
    return;
  }
  ANSWERS[args[0] ?? '']?.(folder, args);
}

if (import.meta.main) {
  main();
}
