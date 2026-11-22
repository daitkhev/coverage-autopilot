import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { argv, env, execPath, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import type { SandboxEngine } from '#infrastructure/sandbox/sandbox-settings';

/** One start of the stand-in, as the stand-in saw it. */
export interface EngineCall {
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  /** What it read on its standard input. */
  readonly input: string;
}

interface Chunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** What the stand-in does when it is asked to run a container. */
export interface EnginePlay {
  /** Written one after another, each to its stream. */
  readonly output?: readonly Chunk[];
  readonly exitCode?: number;
  /** A run that never ends by itself, until it is killed. */
  readonly endless?: boolean;
  /**
   * A run takes the write permission away from the folder that holds its
   * working copy, so the copy cannot be removed after it.
   */
  readonly locksCopies?: boolean;
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

/**
 * macOS adds it to every process that loads its text services, Node among
 * them, so the stand-in was not given it.
 */
const ADDED_BY_THE_SYSTEM = '__CF_USER_TEXT_ENCODING';

/** The longest wait a timer holds: the run waits to be killed. */
const FOREVER_MS = 2_147_483_647;

/**
 * Settings of an engine that is this file, started by Node. It records
 * each call in `record` and plays `play` when it is asked to run.
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

function playRun(play: EnginePlay, args: readonly string[]): void {
  if (play.locksCopies === true) {
    const copy = args[args.indexOf('--workdir') + 1] ?? '';
    chmodSync(dirname(copy), READ_ONLY);
  }
  for (const chunk of play.output ?? []) {
    const stream = chunk.stream === 'stdout' ? STANDARD_OUTPUT : STANDARD_ERROR;
    writeSync(stream, chunk.text);
  }
  if (play.endless === true) {
    setInterval(() => undefined, FOREVER_MS);
    return;
  }
  exit(play.exitCode ?? 0);
}

/** The stand-in records what it got before it does anything else. */
function main(): void {
  const call: EngineCall = {
    arguments: argv.slice(FIRST_ARGUMENT),
    environment: Object.fromEntries(
      Object.entries(env).filter(([name]) => name !== ADDED_BY_THE_SYSTEM),
    ) as Record<string, string>,
    input: readFileSync(STANDARD_INPUT, 'utf8'),
  };
  appendFileSync(env[RECORD] ?? '', `${JSON.stringify(call)}\n`);
  if (call.arguments[0] === 'run') {
    playRun(JSON.parse(env[PLAY] ?? '{}') as EnginePlay, call.arguments);
  }
}

if (import.meta.main) {
  main();
}
