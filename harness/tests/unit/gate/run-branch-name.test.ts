import { describe, expect, it } from 'vitest';

import { isBranchName, runBranchName } from '#harness/gate/run-branch-name';
import { fakeHost } from '#harness/tests/support/fake-host';

const TYPES = ['feat', 'fix', 'docs'];

describe('isBranchName', () => {
  it.each([
    'feat/add-the-queue',
    'fix/a',
    'docs/stage-6',
    'feat/2-workers',
    'dev',
    'main',
    'dependabot/npm_and_yarn/eslint-10.16.0',
    'dependabot/npm_and_yarn/types/node-26.6.7',
    'dependabot/github_actions/actions/checkout-7.0.2',
    'dependabot/npm_and_yarn/dev/@scope/tool-2.0.0',
  ])('should take %s', (name) => {
    expect(isBranchName(name, TYPES)).toBe(true);
  });

  it.each([
    ['no type', 'add-the-queue'],
    ['a type that is not in the list', 'wip/add-the-queue'],
    ['a type in upper case', 'Feat/add-the-queue'],
    ['no description', 'feat/'],
    ['a type alone', 'feat'],
    ['a description in upper case', 'feat/Add-the-queue'],
    ['an underscore', 'feat/add_the_queue'],
    ['a space', 'feat/add the queue'],
    ['two hyphens in a row', 'feat/add--queue'],
    ['a hyphen at the start', 'feat/-add'],
    ['a hyphen at the end', 'feat/add-'],
    ['a third part', 'feat/queue/add'],
    ['an empty name', ''],
    ['a name that only starts like a kept one', 'development'],
    ['a kept name with more after it', 'main/x'],
    ['a kept name in upper case', 'Dev'],
    ['the folder of the robot alone', 'dependabot/'],
    ['a name that only starts like the robot', 'dependabots/npm/x'],
    ['a name that holds the folder of the robot', 'x/dependabot/npm'],
    ['a robot name with a space', 'dependabot/npm x'],
    ['a description over two lines', 'feat/add\nmore'],
  ])('should refuse %s', (_name, name) => {
    expect(isBranchName(name, TYPES)).toBe(false);
  });
});

describe('runBranchName', () => {
  it('should pass a branch that is named after a type', () => {
    const host = fakeHost();

    expect(runBranchName(['fix/a-leak'], host, TYPES)).toBe(0);
    expect(host.printed).toEqual(['branch-name: passed, fix/a-leak']);
  });

  it('should say how a branch is named when it refuses one', () => {
    const host = fakeHost();

    expect(runBranchName(['my-branch'], host, TYPES)).toBe(1);
    expect(host.printed).toEqual([
      'branch-name: "my-branch" is not named type/short-description. ' +
        'The description is in lower case with hyphens. ' +
        'The types: feat, fix, docs.',
    ]);
  });

  it.each([
    ['no name', []],
    ['two names', ['feat/a', 'feat/b']],
  ])('should refuse %s', (_name, given) => {
    const host = fakeHost();

    expect(runBranchName(given, host, TYPES)).toBe(1);
    expect(host.printed).toEqual([
      'usage: branch-name.ts <name of the branch>',
    ]);
  });
});
