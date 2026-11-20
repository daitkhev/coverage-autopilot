import { spawnSync } from 'node:child_process';

import { REPOSITORY_ROOT } from '#harness/shared/policy';

/** A program that Node runs: options of Node, a script and its arguments. */
export interface NodeCommand {
  /** Options for Node itself, before the script. */
  readonly nodeOptions: readonly string[];
  /** The script, from the root of the repository. */
  readonly script: string;
  readonly arguments: readonly string[];
}

/** What a command of the harness needs from the machine it runs on. */
export interface Host {
  /** The tree the command works on. */
  readonly root: string;
  /** Runs a program to its end and says whether it passed. */
  readonly start: (command: NodeCommand) => boolean;
  readonly print: (text: string) => void;
}

/** The real machine: this repository, a child process, the terminal. */
export const processHost: Host = {
  root: REPOSITORY_ROOT,
  start: (command) => {
    const result = spawnSync(
      process.execPath,
      [...command.nodeOptions, command.script, ...command.arguments],
      { cwd: REPOSITORY_ROOT, stdio: 'inherit' },
    );
    return result.status === 0;
  },
  print: (text) => {
    process.stdout.write(`${text}\n`);
  },
};

/** Node and the script come first in `process.argv`. */
const FIRST_ARGUMENT = 2;

/** The arguments this process was started with. */
export function commandArguments(): string[] {
  return process.argv.slice(FIRST_ARGUMENT);
}
