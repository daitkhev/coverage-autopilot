import {
  appendFileSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { argv, pid, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { paceOf, playAtPace } from '#tests/support/stand-in-pace';

/**
 * A stand-in for `gh`, started as a program with `process.execPath`. It
 * records every call and answers from a scenario that a test writes, and
 * it keeps the pull requests it opened, so a second call finds them.
 * Services may run it for several repositories at once, so a pull request
 * is opened in one step that two calls cannot both take, as on a host.
 */

/** How the stand-in answers. A test changes it between calls. */
interface GhScenario {
  readonly loggedIn: boolean;
  readonly canPush: boolean;
  /** What `auth status` prints first, as gh names the account. */
  readonly statusText: string;
  /** When set, `pr create` fails with this answer. */
  readonly createRefusal: string | null;
  /** The stand-in never ends, until it is stopped. */
  readonly hangs: boolean;
}

interface GhCall {
  readonly arguments: readonly string[];
  readonly input: string;
}

interface StoredPullRequest {
  readonly number: number;
  readonly url: string;
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
}

interface Answer {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

interface Request {
  readonly folder: string;
  readonly scenario: GhScenario;
  readonly flags: Map<string, string>;
  readonly input: string;
}

const SCENARIO = 'scenario.json';
const CALLS = 'calls.jsonl';

/** A file for each pull request, named by its branch. */
const PULLS = 'pulls';

/** An empty file for each number a pull request took. */
const NUMBERS = 'numbers';

const TAKEN = 'EEXIST';

/** After Node and the path of this file: the folder, then gh's own. */
const FOLDER_ARGUMENT = 2;

const NOT_AUTHENTICATED = 4;
const FAILED = 1;
const HANG_TICK_MS = 1000;
const FLAG = /^--(?<name>[^=]+)=(?<value>.*)$/su;

const DEFAULT_SCENARIO: GhScenario = {
  loggedIn: true,
  canPush: true,
  statusText: 'github.com\n  Logged in to github.com account acme-bot\n',
  createRefusal: null,
  hangs: false,
};

function readJson<Value>(path: string, fallback: Value): Value {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Value)
    : fallback;
}

function flagsOf(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (const arg of args) {
    const groups = FLAG.exec(arg)?.groups;
    if (groups !== undefined) {
      flags.set(groups['name'] ?? '', groups['value'] ?? '');
    }
  }
  return flags;
}

function loggedOut(command: string, statusText: string): Answer {
  return command === 'auth status'
    ? {
        exitCode: FAILED,
        stderr: `${statusText}You are not logged into any GitHub hosts.\n`,
      }
    : {
        exitCode: NOT_AUTHENTICATED,
        stderr: 'To get started with GitHub CLI, please run: gh auth login\n',
      };
}

function isTaken(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === TAKEN;
}

/** The file of the pull request of a branch, there or not. */
function pullFileOf(folder: string, head: string): string {
  return join(folder, PULLS, `${encodeURIComponent(head)}.json`);
}

function pullsIn(folder: string): StoredPullRequest[] {
  const pulls = join(folder, PULLS);
  return existsSync(pulls)
    ? readdirSync(pulls)
        .map((name) =>
          readJson<StoredPullRequest | null>(join(pulls, name), null),
        )
        .filter((pull) => pull !== null)
        .sort((first, second) => first.number - second.number)
    : [];
}

/** The next number no other call took. A number taken in vain stays a gap. */
function takeNumber(folder: string): number {
  const numbers = join(folder, NUMBERS);
  mkdirSync(numbers, { recursive: true });
  for (let number = readdirSync(numbers).length + 1; ; number += 1) {
    try {
      closeSync(openSync(join(numbers, String(number)), 'wx'));
      return number;
    } catch (error) {
      if (!isTaken(error)) {
        throw error;
      }
    }
  }
}

function listed(folder: string, flags: Map<string, string>): Answer {
  const pull = readJson<StoredPullRequest | null>(
    pullFileOf(folder, flags.get('head') ?? ''),
    null,
  );
  const pulls = pull === null ? [] : [{ number: pull.number, url: pull.url }];
  return { exitCode: 0, stdout: `${JSON.stringify(pulls)}\n` };
}

function alreadyOpened(head: string): Answer {
  return {
    exitCode: FAILED,
    stderr: `a pull request for branch "${head}" already exists\n`,
  };
}

/** The pull request a call asks for, under the next free number. */
function pullOf(request: Request): StoredPullRequest {
  const { flags, folder } = request;
  const number = takeNumber(folder);
  return {
    number,
    url: `https://github.com/${flags.get('repo') ?? ''}/pull/${String(number)}`,
    head: flags.get('head') ?? '',
    base: flags.get('base') ?? '',
    title: flags.get('title') ?? '',
    body: request.input,
  };
}

/**
 * The whole pull request is written aside and then linked to the name of
 * its branch, which fails when the branch has one: so a call that ends
 * halfway leaves none, and two calls never open two.
 */
function opened(folder: string, pull: StoredPullRequest): Answer {
  const draft = join(folder, `draft-${String(pid)}.json`);
  writeFileSync(draft, JSON.stringify(pull));
  mkdirSync(join(folder, PULLS), { recursive: true });
  try {
    linkSync(draft, pullFileOf(folder, pull.head));
  } catch (error) {
    if (!isTaken(error)) {
      throw error;
    }
    return alreadyOpened(pull.head);
  } finally {
    rmSync(draft);
  }
  return { exitCode: 0, stdout: `${pull.url}\n` };
}

function created(request: Request): Answer {
  const { flags, scenario, folder } = request;
  if (scenario.createRefusal !== null) {
    return { exitCode: FAILED, stderr: scenario.createRefusal };
  }
  const head = flags.get('head') ?? '';
  return existsSync(pullFileOf(folder, head))
    ? alreadyOpened(head)
    : opened(folder, pullOf(request));
}

/** What each command of `gh` answers when the user is logged in. */
const COMMANDS: Readonly<Record<string, (request: Request) => Answer>> = {
  'auth status': ({ scenario }) => ({
    exitCode: 0,
    stdout: scenario.statusText,
  }),
  api: ({ scenario }) => {
    const permissions = { admin: false, push: scenario.canPush, pull: true };
    return { exitCode: 0, stdout: JSON.stringify({ permissions }) };
  },
  'pr list': ({ folder, flags }) => listed(folder, flags),
  'pr create': created,
};

function answerOf(folder: string, scenario: GhScenario, call: GhCall): Answer {
  const [group = '', command = '', ...rest] = call.arguments;
  const name = group === 'api' ? group : `${group} ${command}`;
  if (!scenario.loggedIn) {
    return loggedOut(name, scenario.statusText);
  }
  const answer = COMMANDS[name];
  return answer === undefined
    ? { exitCode: FAILED, stderr: `unknown command "${name}"\n` }
    : answer({ folder, scenario, flags: flagsOf(rest), input: call.input });
}

/**
 * Answers once the pace of the stand-in passed. A call whose service died
 * meanwhile still reaches the host, as a request that was sent does.
 */
function play(folder: string, args: readonly string[]): void {
  const scenario = readJson(join(folder, SCENARIO), DEFAULT_SCENARIO);
  const call: GhCall = { arguments: args, input: readFileSync(0, 'utf8') };
  appendFileSync(join(folder, CALLS), `${JSON.stringify(call)}\n`);
  if (scenario.hangs) {
    setInterval(() => undefined, HANG_TICK_MS);
    return;
  }
  setTimeout(() => {
    const answer = answerOf(folder, scenario, call);
    stdout.write(answer.stdout ?? '');
    stderr.write(answer.stderr ?? '');
    process.exitCode = answer.exitCode;
  }, paceOf(folder));
}

/** The side of a test: the command to start, the scenario, the record. */
export class GhStandIn {
  private readonly folder: string;

  public constructor(folder: string) {
    this.folder = folder;
  }

  /** The program and the arguments that come before those of `gh`. */
  public get command(): string[] {
    return [process.execPath, fileURLToPath(import.meta.url), this.folder];
  }

  /** Makes every call take this long, as a call over a network does. */
  public answerAtPace(ms: number): void {
    playAtPace(this.folder, ms);
  }

  public answer(scenario: Partial<GhScenario>): void {
    writeFileSync(
      join(this.folder, SCENARIO),
      JSON.stringify({ ...DEFAULT_SCENARIO, ...scenario }),
    );
  }

  public calls(): GhCall[] {
    const path = join(this.folder, CALLS);
    return existsSync(path)
      ? readFileSync(path, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as GhCall)
      : [];
  }

  /** Every pull request it opened, by their numbers. */
  public pullRequests(): StoredPullRequest[] {
    return pullsIn(this.folder);
  }
}

if (import.meta.main) {
  play(argv[FOLDER_ARGUMENT] ?? '', argv.slice(FOLDER_ARGUMENT + 1));
}
