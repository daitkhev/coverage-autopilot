import { posix } from 'node:path';

import { simpleCommandsOf } from '#harness/agents/shell-words';

/** The branch that takes changes through a pull request only. */
const PROTECTED_BRANCH = 'main';

/** The hooks of git that hold a person and an agent alike. */
export const GIT_HOOKS = 'harness/git';

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Words that may stand before the program of a simple command. */
const BEFORE_THE_PROGRAM = [
  'command',
  'builtin',
  'env',
  'exec',
  'time',
  'nice',
  'nohup',
  'noglob',
  'sudo',
  'if',
  'then',
  'elif',
  'else',
  'while',
  'until',
  'do',
  '!',
  '{',
];

const SHELLS = ['sh', 'bash', 'zsh', 'dash'];
const EVAL = 'eval';

/** The option that gives a shell its script as the next word. */
const SCRIPT_OPTION = /^-[a-z]*c$/;

/** Options of git itself that take the next word as their value. */
const GIT_OPTIONS_WITH_VALUE = [
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
];

/** The setting that says where git takes its hooks from. */
const HOOKS_SETTING = /^core\.hookspath(=|$)/i;

/** Options of `git config` that remove a setting. */
const REMOVING = /^--(unset|unset-all|remove-section)$/;

const SHORT_OPTIONS = /^-[A-Za-z]+$/;

/** Short options that take the rest of the word as their value. */
const COMMIT_OPTIONS_WITH_VALUE = /[mFCct]/;
const PUSH_OPTIONS_WITH_VALUE = /[o]/;

const BRANCH_PREFIX = /^refs\/heads\//;

/** Why a push is refused. The hook of git gives the same reasons. */
export const PUSH_REASONS = {
  forced: 'A forced push is denied. History that was pushed is not rewritten.',
  protected:
    `A push to ${PROTECTED_BRANCH} is denied. ` +
    'It takes changes through a pull request.',
} as const;

const REASONS = {
  ...PUSH_REASONS,
  commit:
    'A commit that skips the hooks is denied. Commit without --no-verify.',
  push: 'A push that skips the hooks is denied. Push without --no-verify.',
  hooks:
    'A change of the place git takes its hooks from is denied. ' +
    `It is ${GIT_HOOKS}.`,
  merge: 'The merge of a pull request is denied. The owner merges.',
} as const;

/** Says which branch the tree is on. Asked only when a push needs it. */
export type Branch = () => string;

/** Whether a word holds a short option, among others in one word. */
function hasShort(word: string, option: string, withValue: RegExp): boolean {
  if (!SHORT_OPTIONS.test(word)) {
    return false;
  }
  const [options = ''] = word.slice(1).split(withValue);
  return options.includes(option);
}

function commitReason(rest: readonly string[]): string | undefined {
  const skips = rest.some(
    (word) =>
      word === '--no-verify' || hasShort(word, 'n', COMMIT_OPTIONS_WITH_VALUE),
  );
  return skips ? REASONS.commit : undefined;
}

function isForce(word: string): boolean {
  return (
    word === '--force' ||
    word.startsWith('--force-with-lease') ||
    word.startsWith('+') ||
    hasShort(word, 'f', PUSH_OPTIONS_WITH_VALUE)
  );
}

/** The branch a pushed name lands on: what stands after the last colon. */
function destinationOf(name: string, branch: Branch): string {
  const target = name.slice(name.lastIndexOf(':') + 1);
  const bare = target.replace(BRANCH_PREFIX, '');
  return bare === 'HEAD' ? branch() : bare;
}

/** A push that names no branch sends the one the tree is on. */
function reachesProtected(rest: readonly string[], branch: Branch): boolean {
  const [, ...names] = rest.filter((word) => !word.startsWith('-'));
  const destinations =
    names.length === 0
      ? [branch()]
      : names.map((name) => destinationOf(name, branch));
  return destinations.includes(PROTECTED_BRANCH);
}

function pushReason(
  rest: readonly string[],
  branch: Branch,
): string | undefined {
  if (rest.includes('--no-verify')) {
    return REASONS.push;
  }
  if (rest.some(isForce)) {
    return REASONS.forced;
  }
  return reachesProtected(rest, branch) ? REASONS.protected : undefined;
}

/** The words of a call of git after its own options: the command first. */
function afterGitOptions(words: readonly string[]): readonly string[] {
  const [first = '', ...rest] = words;
  if (!first.startsWith('-')) {
    return words;
  }
  const hasValue = GIT_OPTIONS_WITH_VALUE.includes(first);
  return afterGitOptions(hasValue ? rest.slice(1) : rest);
}

/**
 * Whether a call of git moves its hooks away: the setting is given a
 * value other than the folder of the harness, or it is removed. Reading
 * the setting moves nothing.
 */
function movesHooks(words: readonly string[]): boolean {
  const at = words.findIndex((word) => HOOKS_SETTING.test(word));
  const setting = words[at] ?? '';
  if (at === -1) {
    return false;
  }
  const value = setting.includes('=')
    ? setting.slice(setting.indexOf('=') + 1)
    : words[at + 1];
  const removed = words.some((word) => REMOVING.test(word));
  return removed || (value !== undefined && value !== GIT_HOOKS);
}

function gitReason(
  words: readonly string[],
  branch: Branch,
): string | undefined {
  if (movesHooks(words)) {
    return REASONS.hooks;
  }
  const [command, ...rest] = afterGitOptions(words);
  if (command === 'commit') {
    return commitReason(rest);
  }
  return command === 'push' ? pushReason(rest, branch) : undefined;
}

function ghReason(rest: readonly string[]): string | undefined {
  const names = rest.filter((word) => !word.startsWith('-'));
  const merges = names.some(
    (name, index) => name === 'pr' && names[index + 1] === 'merge',
  );
  return merges ? REASONS.merge : undefined;
}

/** The script a shell or `eval` is given to run. */
function scriptOf(program: string, rest: readonly string[]): string {
  if (program === EVAL) {
    return rest.join(' ');
  }
  const option = rest.findIndex((word) => SCRIPT_OPTION.test(word));
  return option === -1 ? '' : (rest[option + 1] ?? '');
}

function reasonFor(
  words: readonly string[],
  branch: Branch,
): string | undefined {
  const start = words.findIndex(
    (word) => !ASSIGNMENT.test(word) && !BEFORE_THE_PROGRAM.includes(word),
  );
  const [path = '', ...rest] = start === -1 ? [] : words.slice(start);
  const program = posix.basename(path);
  if (program === 'git') {
    return gitReason(rest, branch);
  }
  if (program === 'gh') {
    return ghReason(rest);
  }
  return SHELLS.includes(program) || program === EVAL
    ? reasonToDeny(scriptOf(program, rest), branch)
    : undefined;
}

/**
 * Why a shell command is denied to an agent, or nothing when it may run.
 * Denied: a commit or a push that skips the hooks, a forced push, a push
 * to the protected branch and the merge of a pull request. It reads the
 * text of the command, so a script file or a variable that holds the
 * same command is not seen.
 */
export function reasonToDeny(
  command: string,
  branch: Branch,
): string | undefined {
  for (const words of simpleCommandsOf(command)) {
    const reason = reasonFor(words, branch);
    if (reason !== undefined) {
      return reason;
    }
  }
  return undefined;
}
