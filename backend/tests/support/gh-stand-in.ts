import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { argv, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * A stand-in for `gh`, started as a program with `process.execPath`. It
 * records every call and answers from a scenario that a test writes, and
 * it keeps the pull requests it opened, so a second call finds them.
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
const PULLS = 'pulls.json';

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

function listed(folder: string, flags: Map<string, string>): Answer {
  const pulls = readJson<StoredPullRequest[]>(join(folder, PULLS), [])
    .filter((pull) => pull.head === flags.get('head'))
    .reverse()
    .slice(0, Number(flags.get('limit')))
    .map(({ number, url }) => ({ number, url }));
  return { exitCode: 0, stdout: `${JSON.stringify(pulls)}\n` };
}

function created(request: Request): Answer {
  const { flags, scenario } = request;
  if (scenario.createRefusal !== null) {
    return { exitCode: FAILED, stderr: scenario.createRefusal };
  }
  const path = join(request.folder, PULLS);
  const pulls = readJson<StoredPullRequest[]>(path, []);
  const head = flags.get('head') ?? '';
  if (pulls.some((pull) => pull.head === head)) {
    return {
      exitCode: FAILED,
      stderr: `a pull request for branch "${head}" already exists\n`,
    };
  }
  const number = pulls.length + 1;
  const url = `https://github.com/${flags.get('repo') ?? ''}/pull/${String(number)}`;
  const base = flags.get('base') ?? '';
  const title = flags.get('title') ?? '';
  const body = request.input;
  writeFileSync(
    path,
    JSON.stringify([...pulls, { number, url, head, base, title, body }]),
  );
  return { exitCode: 0, stdout: `${url}\n` };
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

function play(folder: string, args: readonly string[]): void {
  const scenario = readJson(join(folder, SCENARIO), DEFAULT_SCENARIO);
  const call: GhCall = { arguments: args, input: readFileSync(0, 'utf8') };
  appendFileSync(join(folder, CALLS), `${JSON.stringify(call)}\n`);
  if (scenario.hangs) {
    setInterval(() => undefined, HANG_TICK_MS);
    return;
  }
  const answer = answerOf(folder, scenario, call);
  stdout.write(answer.stdout ?? '');
  stderr.write(answer.stderr ?? '');
  process.exitCode = answer.exitCode;
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

  public pullRequests(): StoredPullRequest[] {
    return readJson<StoredPullRequest[]>(join(this.folder, PULLS), []);
  }
}

if (import.meta.main) {
  play(argv[FOLDER_ARGUMENT] ?? '', argv.slice(FOLDER_ARGUMENT + 1));
}
