import { alignedRows, type Cells } from '#commands/columns';
import type { CommandName } from '#commands/command';
import { PROGRAM } from '#commands/words';

/** A flag that takes a value names it as the help writes it. */
interface FlagRule {
  readonly value?: string;
}

/** Every flag of the command line. A flag without a value is a switch. */
export const FLAGS = {
  '--wait': {},
  '--isolated': {},
  '--json': {},
  '--no-color': {},
  '--below': { value: '<percent>' },
  '--metric': { value: '<name>' },
  '--unmeasured': {},
  '--review': {},
  '--attempts': { value: '<count>' },
  '--tokens': { value: '<count>' },
  '--minutes': { value: '<count>' },
  '--hash': { value: '<hash>' },
} as const satisfies Readonly<Record<string, FlagRule>>;

type FlagName = keyof typeof FLAGS;

/**
 * The flags that change how the client reaches the service or writes.
 * Every command takes them, and so do the screens.
 */
export const CLIENT_FLAGS: readonly FlagName[] = [
  '--isolated',
  '--json',
  '--no-color',
];

/** How a command is typed, what it does, and the flags it takes. */
interface Grammar {
  readonly synopsis: string;
  readonly does: string;
  readonly flags: readonly FlagName[];
}

/** The commands of the document, in the order of its table. */
const GRAMMAR: Readonly<Record<CommandName, Grammar>> = {
  'repo add': {
    synopsis: 'repo add <url>',
    does: 'Connects a repository',
    flags: [],
  },
  'repo list': { synopsis: 'repo list', does: 'Lists repositories', flags: [] },
  'repo check': {
    synopsis: 'repo check <repo>',
    does: 'Runs the access check',
    flags: [],
  },
  'repo threshold': {
    synopsis: 'repo threshold <repo> <percent>',
    does: 'Sets the threshold of a repository',
    flags: [],
  },
  'repo trust': {
    synopsis: 'repo trust <repo> <mode>',
    does: 'Chooses how a repository is installed',
    flags: [],
  },
  scan: { synopsis: 'scan <repo>', does: 'Queues a scan', flags: ['--wait'] },
  files: {
    synopsis: 'files <repo>',
    does: 'Lists files of the latest snapshot',
    flags: ['--below', '--metric', '--unmeasured'],
  },
  improve: {
    synopsis: 'improve <repo> <file>',
    does: 'Requests an improvement',
    flags: ['--wait', '--review', '--attempts', '--tokens', '--minutes'],
  },
  list: { synopsis: 'list', does: 'Lists improvements', flags: [] },
  status: { synopsis: 'status <id>', does: 'Shows one improvement', flags: [] },
  patch: { synopsis: 'patch <id>', does: 'Shows the test patch', flags: [] },
  approve: {
    synopsis: 'approve <id> --hash <hash>',
    does: 'Approves publishing',
    flags: ['--hash'],
  },
  cancel: {
    synopsis: 'cancel <id>',
    does: 'Cancels a scan or an improvement',
    flags: [],
  },
  doctor: {
    synopsis: 'doctor',
    does: 'Shows the state of the service',
    flags: [],
  },
};

/** Whether a person typed the name of a command. */
export function isCommandName(words: string): words is CommandName {
  return Object.hasOwn(GRAMMAR, words);
}

/**
 * The operands a command takes, as `<repo>`, in their order: the words in
 * angle brackets before its first flag.
 */
export function operandsOf(name: CommandName): string[] {
  return GRAMMAR[name].synopsis
    .replace(/ --.*$/u, '')
    .split(' ')
    .filter((word) => word.startsWith('<'));
}

/** The flags a command takes: its own, and those of the client. */
export function flagsOf(name: CommandName): readonly FlagName[] {
  return [...GRAMMAR[name].flags, ...CLIENT_FLAGS];
}

function flagUsage(flag: FlagName): string {
  const rule: FlagRule = FLAGS[flag];
  return rule.value === undefined ? flag : `${flag} ${rule.value}`;
}

/** One line that shows how a command is typed, with its own flags. */
export function usageOf(name: CommandName): string {
  const { synopsis, flags } = GRAMMAR[name];
  const optional = flags
    .filter((flag) => !synopsis.includes(flag))
    .map((flag) => ` [${flagUsage(flag)}]`);
  return `Usage: ${PROGRAM} ${synopsis}${optional.join('')}`;
}

/** The table of flags of the document. */
const FLAG_HELP: readonly Cells[] = [
  ['--wait', 'Block until the work is final'],
  ['--isolated', 'Use a private service for this one command'],
  ['--json', 'Print the result as JSON'],
  ['--no-color', 'No colour. The NO_COLOR variable does the same'],
  [
    '--below <percent>, --metric <name>',
    'For files: another threshold or counter',
  ],
  ['--unmeasured', 'For files: the files that could not be measured'],
  ['--review', 'For improve: wait for approval before publishing'],
  ['--attempts, --tokens, --minutes <count>', 'For improve: the budget'],
  ['--help', 'Print this help'],
];

/** The table of exit codes of the document. */
const EXIT_HELP: readonly Cells[] = [
  ['0', 'The command did what was asked. With --wait: completed or skipped'],
  [
    '1',
    'The work failed or was cancelled, or the service could not be reached',
  ],
  ['2', 'The command line was wrong'],
];

function table(rows: readonly Cells[]): string[] {
  return alignedRows(rows).map((row) => `  ${row}`);
}

/** The commands and the flags, as the two tables of the document. */
export const HELP_TEXT: string = [
  `Usage: ${PROGRAM} [<command>] [<flags>]`,
  '',
  'Without a command it opens the screens.',
  '',
  'Commands:',
  ...table(Object.values(GRAMMAR).map((rule) => [rule.synopsis, rule.does])),
  '',
  'A repository is named as owner/name.',
  'A threshold is a whole percent of lines, such as 90, or default to give',
  'a repository the threshold of the service back.',
  'A mode of install is sandboxed, which runs no code of the repository or',
  'its packages while the network is open, trusted, which installs it as its',
  'developers do, scripts and all, or default to give a repository the mode',
  'of the service back.',
  '',
  'Flags:',
  ...table(FLAG_HELP),
  '',
  'Exit codes:',
  ...table(EXIT_HELP),
].join('\n');
