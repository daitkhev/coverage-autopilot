import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The forks of the stand-in of `gh`. A fork is a copy of the bare
 * repository of its parent beside the others of the host, so git reaches
 * it as it reaches them. The host makes a new fork in the background: the
 * copy is made aside and moved into its place once the delay passed, by a
 * program of its own that outlives the call.
 */

/** The file in the folder of the stand-in that names the folder of the remotes. */
const REMOTES = 'remotes';

/** A file for each repository the account forked, named by it, naming the fork. */
const FORKS = 'forks';

/** Where a new fork is made before it is moved into its place. */
const PENDING = '.pending';

/** After Node and the path of this file: the copy, its place, the delay. */
const MOVE_ARGUMENTS = 2;

export interface ForkRequest {
  /** The folder of the stand-in. */
  readonly folder: string;
  /** The repository to fork, as `<owner>/<name>`. */
  readonly parent: string;
  /** The account the fork is made in. */
  readonly login: string;
  /** How long a new fork takes before git reaches it. */
  readonly delayMs: number;
}

/** Tells the stand-in in `folder` where the bare repositories of the host are. */
export function noteRemotes(folder: string, remotes: string): void {
  writeFileSync(join(folder, REMOTES), remotes);
}

/** A repository there or on its way, so its name is taken. */
function isTaken(remotes: string, fullName: string): boolean {
  const path = join(remotes, fullName);
  return existsSync(path) || existsSync(`${path}${PENDING}`);
}

/**
 * `<login>/<name>`, or the first `<login>/<name>-<n>` that is free when the
 * account has a repository of that name already, as the host does.
 */
function freeName(remotes: string, request: ForkRequest): string {
  const name = request.parent.slice(request.parent.indexOf('/') + 1);
  const first = `${request.login}/${name}`;
  let candidate = first;
  for (let suffix = 1; isTaken(remotes, candidate); suffix += 1) {
    candidate = `${first}-${String(suffix)}`;
  }
  return candidate;
}

function make(source: string, target: string, delayMs: number): void {
  const pending = `${target}${PENDING}`;
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, pending, { recursive: true });
  if (delayMs === 0) {
    renameSync(pending, target);
    return;
  }
  const program = fileURLToPath(import.meta.url);
  spawn(execPath, [program, pending, target, String(delayMs)], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

/**
 * The full name of the fork the account has of the parent: the one an
 * earlier call made, made or not yet, or a new one.
 */
export function forkOf(request: ForkRequest): string {
  const record = join(
    request.folder,
    FORKS,
    encodeURIComponent(request.parent),
  );
  if (existsSync(record)) {
    return readFileSync(record, 'utf8');
  }
  const remotes = readFileSync(join(request.folder, REMOTES), 'utf8');
  const fullName = freeName(remotes, request);
  make(join(remotes, request.parent), join(remotes, fullName), request.delayMs);
  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(record, fullName);
  return fullName;
}

/** Moves a new fork into its place once its delay passed. */
function moveLater(pending: string, target: string, delayMs: number): void {
  setTimeout(() => {
    try {
      renameSync(pending, target);
    } catch {
      // The host was removed meanwhile, and nobody waits for the fork.
    }
  }, delayMs);
}

if (import.meta.main) {
  const [pending = '', target = '', delay = '0'] = argv.slice(MOVE_ARGUMENTS);
  moveLater(pending, target, Number(delay));
}
