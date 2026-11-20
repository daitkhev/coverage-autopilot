import { describe, expect, it } from 'vitest';

import { beforeCommand } from '#harness/agents/before-command';
import { reasonToDeny } from '#harness/agents/denied-command';

const COMMIT =
  'A commit that skips the hooks is denied. Commit without --no-verify.';
const PUSH = 'A push that skips the hooks is denied. Push without --no-verify.';
const FORCED =
  'A forced push is denied. History that was pushed is not rewritten.';
const PROTECTED =
  'A push to main is denied. It takes changes through a pull request.';
const HOOKS =
  'A change of the place git takes its hooks from is denied. ' +
  'It is harness/git.';
const MERGE = 'The merge of a pull request is denied. The owner merges.';

const onDev = (command: string): string | undefined =>
  reasonToDeny(command, () => 'dev');

describe('reasonToDeny', () => {
  it.each([
    'git commit --no-verify -m x',
    'git commit -m x --no-verify',
    'git commit -n',
    'git commit -anm x',
    'git commit --amend -n',
  ])('should deny a commit that skips the hooks: %s', (command) => {
    expect(onDev(command)).toBe(COMMIT);
  });

  it.each([
    'git commit -m "fix -n and --no-verify in the text"',
    'git commit -m x',
    'git commit -am note',
    'git commit -mn',
    'git commit --no-edit --amend',
    'git log -n 5',
    'git commit',
  ])('should allow a commit that runs the hooks: %s', (command) => {
    expect(onDev(command)).toBeUndefined();
  });

  it('should deny a push that skips the hooks', () => {
    expect(onDev('git push --no-verify origin dev')).toBe(PUSH);
    expect(onDev('git push origin dev --no-verify')).toBe(PUSH);
  });

  it.each([
    'git push --force origin dev',
    'git push origin dev --force',
    'git push --force-with-lease origin dev',
    'git push --force-with-lease=dev:abc origin dev',
    'git push -f origin dev',
    'git push -uf origin dev',
    'git push origin +dev',
    'git push origin +dev:dev',
  ])('should deny a forced push: %s', (command) => {
    expect(onDev(command)).toBe(FORCED);
  });

  it.each([
    'git push origin main',
    'git push origin dev main',
    'git push origin dev:main',
    'git push origin HEAD:refs/heads/main',
    'git push origin refs/heads/main',
    'git push origin :main',
    'git push -u origin main',
  ])('should deny a push to the protected branch: %s', (command) => {
    expect(onDev(command)).toBe(PROTECTED);
  });

  it.each([
    'git push',
    'git push origin',
    'git push origin dev',
    'git push -u origin dev',
    'git push origin dev:dev',
    'git push origin main:dev',
    'git push origin maintenance',
    'git push origin feature/main',
    'git push origin HEAD',
    'git push -o ci.skip origin dev',
    'git push --follow-tags origin dev',
    'git push -of origin dev',
    'git fetch origin main',
    'git pull --force origin main',
  ])('should allow an ordinary push or another command: %s', (command) => {
    expect(onDev(command)).toBeUndefined();
  });

  it('should ask for the branch only when a push names none', () => {
    const onMain = (command: string): string | undefined =>
      reasonToDeny(command, () => 'main');

    expect(onMain('git push')).toBe(PROTECTED);
    expect(onMain('git push origin')).toBe(PROTECTED);
    expect(onMain('git push origin HEAD')).toBe(PROTECTED);
    expect(onMain('git push origin HEAD:dev')).toBeUndefined();
    expect(onMain('git push origin dev')).toBeUndefined();
    expect(
      reasonToDeny('git push origin dev', () => {
        throw new Error('The branch was not needed.');
      }),
    ).toBeUndefined();
  });

  it.each([
    'gh pr merge',
    'gh pr merge 12 --squash',
    'gh --repo a/b pr merge 12',
  ])('should deny the merge of a pull request: %s', (command) => {
    expect(onDev(command)).toBe(MERGE);
  });

  it.each(['gh pr view 12', 'gh pr create --title merge', 'gh merge pr'])(
    'should allow another call of gh: %s',
    (command) => {
      expect(onDev(command)).toBeUndefined();
    },
  );

  it.each([
    'git -C . push --force origin dev',
    'git -c user.name=a -c core.editor=vi push -f',
    'git --git-dir .git --work-tree . push origin main',
    'git --no-pager -C backend push origin main',
    'git --namespace x push origin main',
  ])('should see the command behind the options of git: %s', (command) => {
    expect(onDev(command)).toBeDefined();
  });

  it.each([
    'cd backend && git push --force',
    'npm test; git push -f',
    'true || gh pr merge',
    'echo $(git push --force)',
    'FOO=1 BAR=2 git push --force',
    'env FOO=1 git push --force',
    'command git push --force',
    'builtin git push --force',
    'exec git push --force',
    'nice git push --force',
    'noglob git push --force',
    'sudo git push --force',
    'if false; then true; elif git push --force; then true; fi',
    'if false; then true; else git push --force; fi',
    'until git push --force; do true; done',
    'dash -c "git push --force"',
    'time nohup /usr/bin/git push --force',
    'if true; then git push --force; fi',
    'while true; do ! git push --force; done',
    '{ git push --force; }',
    'bash -c "git push --force"',
    'sh -lc "cd a && git push --force"',
    "zsh -c 'gh pr merge'",
    'eval git push --force',
    'eval "git push --force"',
  ])('should find a denied command inside a longer one: %s', (command) => {
    expect(onDev(command)).toBeDefined();
  });

  it.each([
    'echo git push --force',
    'grep -r "git push --force" docs',
    'bash script.sh',
    'bash -c',
    'git',
    '',
    'FOO=1',
    'gitk push --force',
  ])('should allow a command that only names a denied one: %s', (command) => {
    expect(onDev(command)).toBeUndefined();
  });

  it.each([
    'git config core.hooksPath /dev/null',
    'git config --local core.hookspath .husky',
    'git -c core.hooksPath=/dev/null commit -m x',
    'git -c core.hooksPath= push',
    'git config --unset core.hooksPath',
    'git config --unset-all core.hooksPath',
  ])('should deny a move of the hooks of git: %s', (command) => {
    expect(onDev(command)).toBe(HOOKS);
  });

  it.each([
    'git config core.hooksPath harness/git',
    'git -c core.hooksPath=harness/git push --dry-run origin dev',
    'git config core.hooksPath',
    'git config --get core.hooksPath',
    'git config --unset core.editor',
    'git config my.core.hooksPath x',
  ])('should allow the hooks of the harness, and a look: %s', (command) => {
    expect(onDev(command)).toBeUndefined();
  });
});

describe('beforeCommand', () => {
  const call = (command: unknown): string =>
    JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const refusing = (reason: string): string =>
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    });

  it('should say nothing about a command that may run', () => {
    expect(beforeCommand(call('git push origin dev'), () => 'dev')).toBe('');
  });

  it('should refuse a denied command with its reason', () => {
    expect(beforeCommand(call('gh pr merge 3'), () => 'dev')).toBe(
      refusing(MERGE),
    );
  });

  it('should give the branch of the tree to the rule that needs it', () => {
    expect(beforeCommand(call('git push'), () => 'main')).toBe(
      refusing(PROTECTED),
    );
  });

  it.each([
    ['text that is not JSON', 'nope', 'SyntaxError'],
    ['a list', '[]', 'The input of the hook must be a JSON object.'],
    ['no call', '{}', '"tool_input" must be an object.'],
    ['a command that is not text', call(1), '"command" must be a string.'],
  ])('should refuse when the input holds %s', (_, input, fault) => {
    const printed = beforeCommand(input, () => 'dev');

    expect(printed).toContain('"permissionDecision":"deny"');
    expect(printed).toContain('The hook could not read the command: ');
    expect(printed).toContain(JSON.stringify(fault).slice(1, -1));
  });

  it('should refuse when the branch cannot be found', () => {
    const printed = beforeCommand(call('git push'), () => {
      throw new Error('no git here');
    });

    expect(printed).toContain('The hook could not read the command: ');
    expect(printed).toContain('no git here');
  });
});
