import { describe, expect, it } from 'vitest';

import {
  commitMessagesCommand,
  runCommitMessages,
} from '#harness/gate/run-commit-messages';
import { fakeHost } from '#harness/tests/support/fake-host';

const CLI = 'node_modules/@commitlint/cli/cli.js';
const RULES = ['--config', 'harness/configs/commitlint.json'];
const USAGE = 'usage: commit-messages.ts --edit <file> | <from> <to>';

describe('commitMessagesCommand', () => {
  it('should hold the message that is still in its file', () => {
    expect(commitMessagesCommand(['--edit', '.git/COMMIT_EDITMSG'])).toEqual({
      nodeOptions: [],
      script: CLI,
      arguments: [...RULES, '--edit', '.git/COMMIT_EDITMSG'],
    });
  });

  it('should hold the commits after one commit up to another', () => {
    expect(commitMessagesCommand(['abc', 'def']).arguments).toEqual([
      ...RULES,
      '--from',
      'abc',
      '--to',
      'def',
    ]);
  });

  it.each([
    ['nothing', []],
    ['one commit', ['abc']],
    ['no file', ['--edit']],
    ['one word too many', ['abc', 'def', 'ghi']],
  ])('should refuse %s', (_name, given) => {
    expect(() => commitMessagesCommand(given)).toThrow(USAGE);
  });
});

describe('runCommitMessages', () => {
  it('should pass when commitlint does', () => {
    const host = fakeHost();

    expect(runCommitMessages(['abc', 'def'], host)).toBe(0);
    expect(host.started).toEqual([commitMessagesCommand(['abc', 'def'])]);
  });

  it('should fail when commitlint does', () => {
    expect(
      runCommitMessages(['abc', 'def'], fakeHost({ passes: () => false })),
    ).toBe(1);
  });

  it('should start nothing, and fail, when it is started wrongly', () => {
    const host = fakeHost();

    expect(runCommitMessages(['abc'], host)).toBe(1);
    expect(host.started).toEqual([]);
    expect(host.printed).toEqual([USAGE]);
  });
});
