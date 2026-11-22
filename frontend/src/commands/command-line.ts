import type { Command, CommandName } from '#commands/command';
import { buildCommand, type Flags } from '#commands/command-builders';
import {
  CLIENT_FLAGS,
  FLAGS,
  flagsOf,
  HELP_TEXT,
  isCommandName,
  operandsOf,
  usageOf,
} from '#commands/command-grammar';
import { EXIT_CODE } from '#commands/command-io';

/** The flags the entry file reads before it reaches the service. */
interface ClientFlags {
  /** `--isolated`: a private service for this one command. */
  readonly isolated: boolean;
  /** Off with `--no-color`. */
  readonly colour: boolean;
  /** `--json`: the result as the value of the contract. */
  readonly json: boolean;
}

/**
 * What a command line asks for: the screens, one command, the help, or
 * nothing, because the line is wrong. A wrong line is an expected outcome,
 * so it is a value with its exit code, one sentence and the usage.
 */
export type CommandLine =
  | { readonly kind: 'interactive'; readonly flags: ClientFlags }
  | {
      readonly kind: 'command';
      readonly command: Command;
      readonly flags: ClientFlags;
    }
  | {
      readonly kind: 'help';
      readonly exitCode: typeof EXIT_CODE.done;
      readonly text: string;
    }
  | {
      readonly kind: 'wrong';
      readonly exitCode: typeof EXIT_CODE.wrongLine;
      readonly message: string;
      readonly usage: string;
    };

const HELP_WORDS = ['--help', '-h'];

/** `repo add`, `repo list` and `repo check` are named by two words. */
const REPOSITORY_COMMAND_WORDS = 2;

/** The value each flag takes, as the help writes it. A switch takes none. */
const FLAG_VALUES: ReadonlyMap<string, string | undefined> = new Map(
  Object.entries(FLAGS).map(
    ([flag, rule]: readonly [string, { readonly value?: string }]) => [
      flag,
      rule.value,
    ],
  ),
);

function isFlag(word: string): boolean {
  return word.startsWith('-') && word.length > 1;
}

/** `--below=80` and `--below 80` are one flag with its value. */
function flagParts(word: string): readonly [string, string | undefined] {
  const at = word.indexOf('=');
  return at === -1
    ? [word, undefined]
    : [word.slice(0, at), word.slice(at + 1)];
}

/**
 * The positional words and the flags. A flag that takes a value takes the
 * next word, so a value is never read as the name of a command.
 */
function wordsOf(argv: readonly string[]): {
  readonly positional: readonly string[];
  readonly flags: Flags;
} {
  const rest = [...argv];
  const positional: string[] = [];
  const flags = new Map<string, string | undefined>();
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    if (isFlag(word)) {
      const [name, inline] = flagParts(word);
      const takesValue = FLAG_VALUES.get(name) !== undefined;
      flags.set(name, inline ?? (takesValue ? rest.shift() : ''));
    } else {
      positional.push(word);
    }
  }
  return { positional, flags };
}

function flagProblem(
  [flag, value]: readonly [string, string | undefined],
  allowed: readonly string[],
  owner: string,
): string | undefined {
  if (!FLAG_VALUES.has(flag)) {
    return `There is no flag ${flag}.`;
  }
  if (!allowed.includes(flag)) {
    return `${flag} is not a flag of ${owner}.`;
  }
  const wanted = FLAG_VALUES.get(flag);
  if (wanted === undefined) {
    return value === '' ? undefined : `${flag} takes no value.`;
  }
  return value === undefined ? `${flag} needs a value: ${wanted}.` : undefined;
}

function flagsProblem(
  flags: Flags,
  allowed: readonly string[],
  owner: string,
): string | undefined {
  return [...flags]
    .map((flag) => flagProblem(flag, allowed, owner))
    .find((problem) => problem !== undefined);
}

function operandsProblem(
  name: CommandName,
  operands: readonly string[],
): string | undefined {
  const wanted = operandsOf(name);
  if (operands.length < wanted.length) {
    return `${name} needs ${wanted.slice(operands.length).join(' ')}.`;
  }
  return operands.length > wanted.length
    ? `There is an argument too many: ${operands.slice(wanted.length).join(' ')}.`
    : undefined;
}

function wrongLine(message: string, usage: string): CommandLine {
  return { kind: 'wrong', exitCode: EXIT_CODE.wrongLine, message, usage };
}

function clientFlagsOf(flags: Flags): ClientFlags {
  return {
    isolated: flags.has('--isolated'),
    colour: !flags.has('--no-color'),
    json: flags.has('--json'),
  };
}

function commandLineOf(
  name: CommandName,
  operands: readonly string[],
  flags: Flags,
): CommandLine {
  const built =
    flagsProblem(flags, flagsOf(name), name) ??
    operandsProblem(name, operands) ??
    buildCommand(name, {
      first: operands[0] ?? '',
      second: operands[1] ?? '',
      flags,
    });
  return typeof built === 'string'
    ? wrongLine(built, usageOf(name))
    : { kind: 'command', command: built, flags: clientFlagsOf(flags) };
}

/**
 * Reads the arguments of the process, after the program. It reads nothing
 * else: whether there is a terminal for the screens is the entry file's.
 */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  if (argv.some((word) => HELP_WORDS.includes(word))) {
    return { kind: 'help', exitCode: EXIT_CODE.done, text: HELP_TEXT };
  }
  const { positional, flags } = wordsOf(argv);
  if (positional.length === 0) {
    const problem = flagsProblem(flags, CLIENT_FLAGS, 'the screens');
    return problem === undefined
      ? { kind: 'interactive', flags: clientFlagsOf(flags) }
      : wrongLine(problem, HELP_TEXT);
  }
  const length = positional[0] === 'repo' ? REPOSITORY_COMMAND_WORDS : 1;
  const name = positional.slice(0, length).join(' ');
  return isCommandName(name)
    ? commandLineOf(name, positional.slice(length), flags)
    : wrongLine(`There is no command ${name}.`, HELP_TEXT);
}
