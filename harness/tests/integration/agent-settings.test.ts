import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GIT_HOOKS } from '#harness/agents/denied-command';
import { PROFILES } from '#harness/gate/steps';
import { readFrozenPolicy } from '#harness/shared/frozen';
import { readJsonRecord } from '#harness/shared/json';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const HOOKS = 'harness/agents/hooks';
const CLAUDE = 'harness/agents/claude/settings.json';
const CODEX = 'harness/agents/codex/hooks.json';

/** A hook that is built and waits is named here. Every hook is on now. */
const NOT_SWITCHED_ON: string[] = [];

/** The owner may run a file, and so may everyone else. */
const MAY_RUN = 0o111;

function rootFile(name: string): string {
  return readFileSync(join(REPOSITORY_ROOT, name), 'utf8');
}

function hooksOf(settings: string): unknown {
  return readJsonRecord(join(REPOSITORY_ROOT, settings))['hooks'];
}

/** The hook files that the settings of an agent do not start. */
function notStartedBy(
  hooks: unknown,
  start: (name: string) => string,
): string[] {
  const text = JSON.stringify(hooks);
  return readdirSync(join(REPOSITORY_ROOT, HOOKS)).filter(
    (name) => !text.includes(JSON.stringify(start(name)).slice(1, -1)),
  );
}

describe('frozen.json', () => {
  it('should name the policy as the design does', () => {
    expect(readFrozenPolicy()).toEqual({
      places: ['harness/', '.github/', '.claude/', '.codex/', '*'],
      names: ['tsconfig*.json'],
      free: ['harness/baseline.json', 'README.md', 'package-lock.json'],
      withPolicy: ['harness/baseline.json', 'package-lock.json'],
    });
  });
});

describe.each([
  ['Claude Code', '.claude/settings.json', CLAUDE],
  ['Codex', '.codex/hooks.json', CODEX],
])('the settings of %s', (_, link, settings) => {
  it('should be in the harness, and reach the agent through a link', () => {
    const path = join(REPOSITORY_ROOT, link);

    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(readlinkSync(path)).toBe(`../${settings}`);
    expect(lstatSync(join(REPOSITORY_ROOT, settings)).isFile()).toBe(true);
  });

  it('should hold hooks and nothing else', () => {
    const file = readJsonRecord(join(REPOSITORY_ROOT, settings));

    expect(Object.keys(file)).toEqual(['hooks']);
  });
});

describe('the hooks of Claude Code', () => {
  const start = (name: string): string =>
    `\${CLAUDE_PROJECT_DIR}/${HOOKS}/${name}`;

  /** An agent that stops is judged, and so is a helper it started. */
  const judged = {
    hooks: [
      {
        type: 'command',
        command: 'node',
        args: [start('done.ts')],
        timeout: 300,
      },
    ],
  };

  it('should start the shared hooks as Node with a list of arguments', () => {
    expect(hooksOf(CLAUDE)).toEqual({
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: [start('before-command.ts')],
            },
          ],
        },
        {
          matcher: 'Edit|MultiEdit|Write|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: [start('before-edit.ts'), 'ask'],
            },
          ],
        },
      ],
      Stop: [judged],
      SubagentStop: [judged],
    });
  });

  it('should start every hook of the folder but the ones that wait', () => {
    expect(notStartedBy(hooksOf(CLAUDE), start)).toEqual(NOT_SWITCHED_ON);
  });
});

describe('the hooks of Codex', () => {
  const start = (name: string): string =>
    `node "$(git rev-parse --show-toplevel)/${HOOKS}/${name}"`;

  it('should start the shared hooks from the root of the repository', () => {
    expect(hooksOf(CODEX)).toEqual({
      PreToolUse: [
        {
          matcher: '^Bash$',
          hooks: [{ type: 'command', command: start('before-command.ts') }],
        },
        {
          matcher: '^apply_patch$',
          hooks: [{ type: 'command', command: start('before-edit.ts') }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: 'command', command: start('done.ts'), timeout: 300 }],
        },
      ],
    });
  });

  it('should start every hook of the folder but the ones that wait', () => {
    expect(notStartedBy(hooksOf(CODEX), start)).toEqual(NOT_SWITCHED_ON);
  });
});

describe('the hooks of git', () => {
  it('should be in the folder that the denied commands protect', () => {
    expect(GIT_HOOKS).toBe('harness/git');
    expect(readdirSync(join(REPOSITORY_ROOT, GIT_HOOKS)).sort()).toEqual([
      'commit-msg',
      'pre-commit',
      'pre-push',
    ]);
  });

  it.each([
    ['commit-msg', 'exec node harness/bin/commit-messages.ts --edit "$1"'],
    ['pre-commit', 'exec node harness/bin/check.ts fast'],
    ['pre-push', 'exec node harness/bin/before-push.ts'],
  ])('should start the gate by its path in %s', (name, command) => {
    const path = join(REPOSITORY_ROOT, GIT_HOOKS, name);
    const [shell, , ...rest] = readFileSync(path, 'utf8').split('\n');

    expect(shell).toBe('#!/bin/sh');
    expect(rest).toEqual([command, '']);
    expect(statSync(path).mode & MAY_RUN).toBe(MAY_RUN);
  });
});

describe('AGENTS.md', () => {
  it('should name the gate by its path, and every profile', () => {
    const text = rootFile('AGENTS.md');

    expect(text).toContain('node harness/bin/check.ts');
    for (const profile of Object.keys(PROFILES)) {
      expect(text).toContain(`| \`${profile}\` |`);
    }
  });

  it('should say where the list of the policy is', () => {
    expect(rootFile('AGENTS.md')).toContain('harness/policy/frozen.json');
  });

  it('should say how the hooks of git are switched on', () => {
    expect(rootFile('AGENTS.md')).toContain(
      `git config core.hooksPath ${GIT_HOOKS}`,
    );
  });

  /** Claude Code reads `AGENTS.md` itself only when no `CLAUDE.md` exists. */
  it('should be the one text for every agent, with no CLAUDE.md beside it', () => {
    expect(existsSync(join(REPOSITORY_ROOT, 'CLAUDE.md'))).toBe(false);
  });
});
