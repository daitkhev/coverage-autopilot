import { describe, expect, it } from 'vitest';

import type { Command } from '#commands/command';
import { HELP_TEXT } from '#commands/command-grammar';
import { parseCommandLine } from '#commands/command-line';

const PLAIN = { isolated: false, colour: true, json: false };
const REPO = 'acme/widgets';
const FILE = 'src/widget.ts';
const IMPROVEMENT = 'improvement-1';

function commandOf(argv: readonly string[]): Command {
  const line = parseCommandLine(argv);
  if (line.kind !== 'command') {
    throw new Error(`The line ${argv.join(' ')} is ${line.kind}.`);
  }
  return line.command;
}

describe('parseCommandLine', () => {
  describe('when there is no command', () => {
    it('should ask for the screens', () => {
      expect(parseCommandLine([])).toEqual({
        kind: 'interactive',
        flags: PLAIN,
      });
    });

    it('should keep the flags of the client for the entry file', () => {
      expect(parseCommandLine(['--isolated', '--no-color', '--json'])).toEqual({
        kind: 'interactive',
        flags: { isolated: true, colour: false, json: true },
      });
    });

    it('should refuse a flag of a command, with the help', () => {
      expect(parseCommandLine(['--wait'])).toEqual({
        kind: 'wrong',
        exitCode: 2,
        message: '--wait is not a flag of the screens.',
        usage: HELP_TEXT,
      });
    });
  });

  describe('when the line asks for help', () => {
    it.each([[['--help']], [['-h']], [['scan', REPO, '--help']]])(
      'should give the help for %j and end with 0',
      (argv) => {
        expect(parseCommandLine(argv)).toEqual({
          kind: 'help',
          exitCode: 0,
          text: HELP_TEXT,
        });
      },
    );
  });

  describe('when the command is unknown', () => {
    it.each([
      [['deploy'], 'There is no command deploy.'],
      [['repo'], 'There is no command repo.'],
      [['repo', 'remove', REPO], 'There is no command repo remove.'],
    ])('should give the help for %j and end with 2', (argv, message) => {
      expect(parseCommandLine(argv)).toEqual({
        kind: 'wrong',
        exitCode: 2,
        message,
        usage: HELP_TEXT,
      });
    });
  });

  it.each<[readonly string[], Command]>([
    [
      ['repo', 'add', 'https://github.com/acme/widgets'],
      { name: 'repo add', url: 'https://github.com/acme/widgets' },
    ],
    [['repo', 'list'], { name: 'repo list' }],
    [['repo', 'check', REPO], { name: 'repo check', repository: REPO }],
    [['scan', REPO], { name: 'scan', repository: REPO, wait: false }],
    [['scan', '--wait', REPO], { name: 'scan', repository: REPO, wait: true }],
    [['files', REPO], { name: 'files', repository: REPO, query: {} }],
    [
      ['files', REPO, '--below', '70', '--metric', 'branches', '--unmeasured'],
      {
        name: 'files',
        repository: REPO,
        query: { below: 70, metric: 'branches', state: 'unmeasured' },
      },
    ],
    [
      ['files', REPO, '--below=72.5'],
      { name: 'files', repository: REPO, query: { below: 72.5 } },
    ],
    [
      ['improve', REPO, FILE],
      {
        name: 'improve',
        repository: REPO,
        wait: false,
        request: { filePath: FILE, mode: 'automatic', budget: {} },
      },
    ],
    [
      [
        'improve',
        REPO,
        FILE,
        '--review',
        '--wait',
        '--attempts',
        '5',
        '--tokens=90000',
        '--minutes',
        '20',
      ],
      {
        name: 'improve',
        repository: REPO,
        wait: true,
        request: {
          filePath: FILE,
          mode: 'review',
          budget: { attempts: 5, tokens: 90_000, minutes: 20 },
        },
      },
    ],
    [['list'], { name: 'list' }],
    [['status', IMPROVEMENT], { name: 'status', id: IMPROVEMENT }],
    [['patch', IMPROVEMENT], { name: 'patch', id: IMPROVEMENT }],
    [
      ['approve', IMPROVEMENT, '--hash', '9c1e7ab'],
      { name: 'approve', id: IMPROVEMENT, hash: '9c1e7ab' },
    ],
    [['cancel', 'scan-1'], { name: 'cancel', id: 'scan-1' }],
    [['doctor'], { name: 'doctor' }],
  ])('should read %j as its command', (argv, command) => {
    expect(commandOf(argv)).toEqual(command);
  });

  it('should keep the flags of the client beside the command', () => {
    expect(
      parseCommandLine(['list', '--json', '--isolated', '--no-color']),
    ).toEqual({
      kind: 'command',
      command: { name: 'list' },
      flags: { isolated: true, colour: false, json: true },
    });
  });

  describe('when the line is wrong', () => {
    it.each([
      [['list', '--fast'], 'There is no flag --fast.'],
      [['list', '-v'], 'There is no flag -v.'],
      [['list', '--wait'], '--wait is not a flag of list.'],
      [['scan', REPO, '--wait=yes'], '--wait takes no value.'],
      [['files', REPO, '--below'], '--below needs a value: <percent>.'],
      [['scan'], 'scan needs <repo>.'],
      [['improve', REPO], 'improve needs <file>.'],
      [['repo', 'add'], 'repo add needs <url>.'],
      [['status', IMPROVEMENT, 'more'], 'There is an argument too many: more.'],
      [
        ['scan', 'widgets'],
        'widgets is not a repository; name it as owner/name.',
      ],
      [
        ['repo', 'check', 'acme/widgets/main'],
        'acme/widgets/main is not a repository; name it as owner/name.',
      ],
      [
        ['files', 'widgets'],
        'widgets is not a repository; name it as owner/name.',
      ],
      [
        ['improve', 'widgets', FILE],
        'widgets is not a repository; name it as owner/name.',
      ],
      [
        ['files', REPO, '--below', 'most'],
        '--below takes a percent such as 80, not most.',
      ],
      [
        ['files', REPO, '--metric', 'paths'],
        '--metric takes one of statements, branches, functions, lines.',
      ],
      [
        ['improve', REPO, FILE, '--minutes', 'half'],
        '--minutes takes a whole number such as 3, not half.',
      ],
      [['approve', IMPROVEMENT], 'approve needs --hash <hash>.'],
    ])('should refuse %j with one sentence', (argv, message) => {
      expect(parseCommandLine(argv)).toMatchObject({
        kind: 'wrong',
        exitCode: 2,
        message,
      });
    });

    it('should give the usage of the command, with its own flags', () => {
      expect(parseCommandLine(['improve', REPO])).toMatchObject({
        usage:
          'Usage: coverage-autopilot improve <repo> <file> [--wait] ' +
          '[--review] [--attempts <count>] [--tokens <count>] ' +
          '[--minutes <count>]',
      });
      expect(parseCommandLine(['approve'])).toMatchObject({
        usage: 'Usage: coverage-autopilot approve <id> --hash <hash>',
      });
    });
  });
});
