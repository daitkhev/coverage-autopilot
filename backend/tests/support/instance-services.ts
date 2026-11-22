import { execFileSync } from 'node:child_process';

import { BUILT_FILE } from '#tests/support/built-service';

/**
 * Every process with its environment, as `ps` lists them: `e` prints the
 * variables a process started with after its command, on macOS and on
 * Linux, and `ww` keeps each line whole however long it is.
 */
const LISTING = ['axeww', '-o', 'pid=,stat=,command='];

/** The variables of every process of the machine take megabytes: 64. */
const LISTING_BYTES = 67_108_864;

/** The state `ps` gives a process that ended and was not reaped yet. */
const ZOMBIE = 'Z';

/** The words of a line of the listing, with no space around them. */
const SPACES = /\s+/u;

/**
 * The ids of the processes of the built service that run for the
 * instance in `directory`. They are found by the variable of the
 * instance, since the command of a service names no instance: those the
 * test starts, and those a client starts, which are detached from it.
 * Each word of a line is compared whole, so a folder whose name starts
 * with the name of another is not taken for it, and a service of another
 * instance on the machine is never counted.
 */
export function servicesOf(directory: string): number[] {
  const listing = execFileSync('ps', LISTING, {
    encoding: 'utf8',
    maxBuffer: LISTING_BYTES,
  });
  const instance = `AUTOPILOT_INSTANCE_DIR=${directory}`;
  return listing.split('\n').flatMap((line) => {
    const [id = '', state = '', ...words] = line.trim().split(SPACES);
    const serves =
      !state.startsWith(ZOMBIE) &&
      words.includes(BUILT_FILE) &&
      words.includes(instance);
    return serves ? [Number(id)] : [];
  });
}

/** Sends the signal to each of the processes that still runs. */
export function signalEach(
  ids: readonly number[],
  signal: NodeJS.Signals,
): void {
  for (const id of ids) {
    try {
      process.kill(id, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
    }
  }
}
