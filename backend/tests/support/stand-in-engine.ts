import { spawn } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { argv, env, execPath, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import type { SandboxEngine } from '#infrastructure/sandbox/sandbox-settings';
import { shippedImageLabel } from '#tests/support/shipped-image';

/** One start of the stand-in, as the stand-in saw it. */
export interface EngineCall {
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  /** What it read on its standard input. */
  readonly input: string;
  /** For a build, what the folder it was given beside the file holds. */
  readonly context?: readonly string[];
}

interface Chunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** How one call ends: what it writes, and its code, or never. */
interface Ending {
  /** Written one after another, each to its stream. */
  readonly output?: readonly Chunk[];
  readonly exitCode?: number;
  /** A call that never ends by itself, until it is killed. */
  readonly endless?: boolean;
  /**
   * A call that starts a helper first, as an engine starts the program
   * that reads its passwords. The helper has the streams of the call and
   * never ends by itself.
   */
  readonly helper?: boolean;
  /** A file the call waits for before it writes and ends, as a test says. */
  readonly until?: string;
}

/** A container the stand-in lists, as if it were there. */
export interface ListedContainer {
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
}

/**
 * What the stand-in does when it is asked to run a container, and, when
 * a test says so, to remove or to list containers or to look at, build or
 * pull an image. Left out, a removal ends well, a listing prints the
 * names of `containers` whose labels match every filter of the call, an
 * image is there with the label of the file the service ships, and a
 * build and a pull end well.
 */
export interface EnginePlay extends Ending {
  /**
   * A run takes the write permission away from the folder that holds its
   * working copy, so the copy cannot be removed after it.
   */
  readonly locksCopies?: boolean;
  readonly removal?: Ending;
  readonly listing?: Ending;
  readonly containers?: readonly ListedContainer[];
  readonly inspection?: Ending;
  readonly build?: Ending;
  readonly pull?: Ending;
}

const RECORD = 'STAND_IN_RECORD';
const PLAY = 'STAND_IN_PLAY';

/** `argv` starts with Node and this file. */
const FIRST_ARGUMENT = 2;

const STANDARD_INPUT = 0;
const STANDARD_OUTPUT = 1;
const STANDARD_ERROR = 2;

/** Read and enter, but not write. */
const READ_ONLY = 0o555;

/** How a listing names the label it filters by. */
const LABEL_FILTER = 'label=';

/**
 * macOS adds it to every process that loads its text services, Node among
 * them, so the stand-in was not given it.
 */
const ADDED_BY_THE_SYSTEM = '__CF_USER_TEXT_ENCODING';

/** The longest wait a timer holds: the call waits to be killed. */
const FOREVER_MS = 2_147_483_647;

const FOREVER = String(FOREVER_MS);

/** How often a call that waits for a file looks for it. */
const LOOK_AGAIN_MS = 10;

/**
 * Settings of an engine that is this file, started by Node. It records
 * each call in `record` and plays `play`.
 */
export function standInEngine(
  record: string,
  play: EnginePlay = {},
): SandboxEngine {
  return {
    // Node takes `--env-file` for itself even after the script, up to `--`.
    command: [execPath, '--', fileURLToPath(import.meta.url)],
    environment: { [RECORD]: record, [PLAY]: JSON.stringify(play) },
  };
}

/** The calls the stand-in recorded, in order. None before its first. */
export function callsIn(record: string): EngineCall[] {
  if (!existsSync(record)) {
    return [];
  }
  return readFileSync(record, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as EngineCall);
}

/** The helper waits to be killed, with the streams of the call. */
function startHelper(ending: Ending): void {
  if (ending.helper === true) {
    spawn(execPath, ['--eval', `setInterval(() => undefined, ${FOREVER})`], {
      stdio: 'inherit',
    });
  }
}

function end(ending: Ending): void {
  if (ending.until !== undefined && !existsSync(ending.until)) {
    setTimeout(() => {
      end(ending);
    }, LOOK_AGAIN_MS);
    return;
  }
  for (const chunk of ending.output ?? []) {
    const stream = chunk.stream === 'stdout' ? STANDARD_OUTPUT : STANDARD_ERROR;
    writeSync(stream, chunk.text);
  }
  startHelper(ending);
  if (ending.endless === true) {
    setInterval(() => undefined, FOREVER_MS);
    return;
  }
  exit(ending.exitCode ?? 0);
}

function playRun(play: EnginePlay, args: readonly string[]): void {
  if (play.locksCopies === true) {
    const copy = args[args.indexOf('--workdir') + 1] ?? '';
    chmodSync(dirname(copy), READ_ONLY);
  }
  end(play);
}

function playRemoval(play: EnginePlay): void {
  end(play.removal ?? {});
}

/** The containers whose labels hold every `key=value` the call filters by. */
function playListing(play: EnginePlay, args: readonly string[]): void {
  if (play.listing !== undefined) {
    end(play.listing);
    return;
  }
  const filters = args
    .filter((arg) => arg.startsWith(LABEL_FILTER))
    .map((arg) => arg.slice(LABEL_FILTER.length).split('='));
  const names = (play.containers ?? [])
    .filter(({ labels }) =>
      filters.every(([key = '', value]) => labels[key] === value),
    )
    .map(({ name }) => `${name}\n`);
  end({ output: [{ stream: 'stdout', text: names.join('') }] });
}

/** An image the engine has, labelled as one built from the shipped file. */
function playInspection(play: EnginePlay): void {
  const label = { stream: 'stdout', text: `${shippedImageLabel()}\n` } as const;
  end(play.inspection ?? { output: [label] });
}

const PLAYS: Readonly<
  Record<string, (play: EnginePlay, args: readonly string[]) => void>
> = {
  run: playRun,
  rm: playRemoval,
  ps: playListing,
  image: playInspection,
  build: (play) => {
    end(play.build ?? {});
  },
  pull: (play) => {
    end(play.pull ?? {});
  },
};

/** For a build, the entries of the folder it was given beside the file. */
function contextOf(args: readonly string[]): Pick<EngineCall, 'context'> {
  const folder = args.at(-1);
  return args[0] === 'build' && folder !== undefined
    ? { context: readdirSync(folder) }
    : {};
}

/** The stand-in records what it got before it does anything else. */
function main(): void {
  const call: EngineCall = {
    arguments: argv.slice(FIRST_ARGUMENT),
    environment: Object.fromEntries(
      Object.entries(env).filter(([name]) => name !== ADDED_BY_THE_SYSTEM),
    ) as Record<string, string>,
    input: readFileSync(STANDARD_INPUT, 'utf8'),
    ...contextOf(argv.slice(FIRST_ARGUMENT)),
  };
  appendFileSync(env[RECORD] ?? '', `${JSON.stringify(call)}\n`);
  const play = JSON.parse(env[PLAY] ?? '{}') as EnginePlay;
  PLAYS[call.arguments[0] ?? '']?.(play, call.arguments);
}

if (import.meta.main) {
  main();
}
