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

import { coverageReportOf } from '#tests/support/widgets-project';

/**
 * A stand-in for the program of the container engine that plays the
 * tools a container would run, started by Node with a folder of its own.
 * It never starts a container and never runs code of the project: for
 * each `run` it takes the working copy the container works in and the
 * command after the image, writes what the tool would write into the
 * copy, and prints what the tool would print.
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

/** After Node and the path of this file: the folder, then the engine's own. */
const FOLDER_ARGUMENT = 2;

/** After the flag of the file of variables: the file, the image, the command. */
const COMMAND_AFTER_FLAG = 3;

/** What a shell answers for a program it does not find. */
const NOT_FOUND = 127;

/** The programs the adapters start by their paths in the copy. */
const COMPILER = 'node_modules/typescript/bin/tsc';
const JEST = 'node_modules/jest/bin/jest.js';

/** Jest writes its report as this file in the folder it is given. */
const COVERAGE_FILE = 'coverage-final.json';
const COVERAGE_FOLDER = /^--coverageDirectory=(?<folder>.+)$/u;

/**
 * The program and the arguments of the engine, for the variable of the
 * service that names it. Node takes `--env-file` for itself even after
 * the script, up to `--`.
 */
export function playingEngine(folder: string): string[] {
  return [execPath, '--', fileURLToPath(import.meta.url), folder];
}

/** The containers the stand-in in `folder` was asked to run, in order. */
export function playedRuns(folder: string): PlayedRun[] {
  const path = join(folder, RUNS);
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as PlayedRun)
    : [];
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

/** Each tool by its program, or by the program and its first argument. */
const TOOLS: Readonly<Record<string, Tool>> = {
  'npm ci': installing([COMPILER, JEST]),
  [`node ${JEST}`]: playJest,
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

/**
 * Records each `run` and plays its tool. Any other call, such as the
 * removal of a container, succeeds: no container was ever made.
 */
function main(): void {
  const [folder = '', ...args] = argv.slice(FOLDER_ARGUMENT);
  const input = readFileSync(0, 'utf8');
  if (args[0] !== 'run') {
    return;
  }
  const run = runOf(args, input);
  appendFileSync(join(folder, RUNS), `${JSON.stringify(run)}\n`);
  const played = toolOf(run.command)(run);
  stdout.write(played.stdout ?? '');
  stderr.write(played.stderr ?? '');
  process.exitCode = played.exitCode;
}

if (import.meta.main) {
  main();
}
