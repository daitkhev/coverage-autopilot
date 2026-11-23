import { mkdirSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { beforeEdit } from '#harness/agents/before-edit';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

const POLICY_REASON =
  ' is a file of the policy. A change of the policy ' +
  'lands on its own, and the owner decides it.';

function answer(decision: string, reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  });
}

const asking = (reason: string): string => answer('ask', reason);

describe('beforeEdit, for an agent that names one file', () => {
  const root = (): string => bench.repository.root;

  /** What the hook prints for an edit of this file of the tree. */
  function edit(path: string, field = 'file_path'): string {
    const call = {
      tool_name: 'Edit',
      tool_input: { [field]: join(root(), path) },
    };
    return beforeEdit(JSON.stringify(call), root(), 'ask');
  }

  it.each([
    'harness/policy/limits.json',
    'harness/architecture/rules/file-name.ts',
    'harness/tests/unit/a.test.ts',
    '.github/workflows/ci.yml',
    '.claude/settings.json',
    '.codex/hooks.json',
    'package.json',
    '.npmrc',
    'AGENTS.md',
    'tsconfig.json',
    'backend/tsconfig.json',
    '..rc',
  ])('should ask the person before an edit of %s', (path) => {
    expect(edit(path)).toBe(asking(`${path}${POLICY_REASON}`));
  });

  it.each([
    'backend/src/main.ts',
    'backend/package.json',
    'frontend/src/screens/overview.tsx',
    'docs/plan/harness.md',
    'harness/baseline.json',
    'README.md',
    'package-lock.json',
  ])('should say nothing about an edit of %s', (path) => {
    expect(edit(path)).toBe('');
  });

  it('should read the file of a notebook edit', () => {
    expect(edit('harness/a.ipynb', 'notebook_path')).toBe(
      asking(`harness/a.ipynb${POLICY_REASON}`),
    );
  });

  it('should say nothing about a file outside the tree', () => {
    expect(edit('../elsewhere/tsconfig.json')).toBe('');
    expect(edit('..')).toBe('');
  });

  it('should judge an edit through a link by the file it reaches', () => {
    bench.repository.write('harness/policy/limits.json', '{}\n');
    mkdirSync(join(root(), 'backend'));
    symlinkSync(
      '../harness/policy/limits.json',
      join(root(), 'backend/limits.json'),
    );

    expect(edit('backend/limits.json')).toBe(
      asking(`harness/policy/limits.json${POLICY_REASON}`),
    );
  });

  it('should know the tree by another name of its folder', () => {
    const real = realpathSync(root());
    const alias = `${real}-by-another-name`;
    symlinkSync(real, alias);
    const call = { tool_input: { file_path: join(alias, 'package.json') } };

    try {
      expect(beforeEdit(JSON.stringify(call), real, 'ask')).toBe(
        asking(`package.json${POLICY_REASON}`),
      );
    } finally {
      unlinkSync(alias);
    }
  });

  it.each([
    ['text that is not JSON', 'nope', 'SyntaxError'],
    ['a list', '[]', 'The input of the hook must be a JSON object.'],
    ['no edit', '{}', '"tool_input" must be an object.'],
    ['an edit with no file', '{"tool_input":{}}', 'The edit names no file.'],
    [
      'a file that is not text',
      '{"tool_input":{"file_path":1}}',
      'The edit names no file.',
    ],
  ])('should ask when the input holds %s', (_, input, fault) => {
    const printed = beforeEdit(input, root(), 'ask');

    expect(printed).toContain('"permissionDecision":"ask"');
    expect(printed).toContain('The hook could not read the edit: ');
    expect(printed).toContain(JSON.stringify(fault).slice(1, -1));
  });

  it('should ask when the tree itself cannot be found', () => {
    const call = { tool_input: { file_path: '/nowhere/src/a.ts' } };

    expect(beforeEdit(JSON.stringify(call), '/nowhere', 'ask')).toContain(
      'The hook could not read the edit: ',
    );
  });
});

describe('beforeEdit, in a tree that git linked to the first one', () => {
  const LINKED = '.claude/worktrees/agent-a';
  const first = (): string => bench.repository.root;
  const refusing = (reason: string): string =>
    answer('deny', `${reason} Stop and ask the owner.`);

  /** A second tree of the repository, where an agent works. */
  function linked(): string {
    bench.repository.commit();
    return bench.repository.link(LINKED, 'feat/a');
  }

  /** What the hook of this tree prints for an edit of a file. */
  function edit(file: string, home = first()): string {
    const call = { tool_name: 'Edit', tool_input: { file_path: file } };
    return beforeEdit(JSON.stringify(call), home, 'ask');
  }

  it.each(['harness/policy/limits.json', 'package.json', '.claude/a.json'])(
    'should refuse an edit of %s, and not ask a person who is not there',
    (path) => {
      expect(edit(join(linked(), path))).toBe(
        refusing(`${path}${POLICY_REASON}`),
      );
    },
  );

  it.each(['backend/src/main.ts', 'README.md', 'docs/plan/harness.md'])(
    'should say nothing about an edit of %s',
    (path) => {
      expect(edit(join(linked(), path))).toBe('');
    },
  );

  it('should judge the same way when the hook runs from the linked tree', () => {
    const tree = linked();

    expect(edit(join(tree, 'tsconfig.json'), tree)).toBe(
      refusing(`tsconfig.json${POLICY_REASON}`),
    );
    expect(edit(join(tree, 'backend/src/main.ts'), tree)).toBe('');
  });

  it('should still ask about the policy of the first tree', () => {
    const tree = linked();

    expect(edit(join(first(), 'package.json'), tree)).toBe(
      asking(`package.json${POLICY_REASON}`),
    );
  });

  it('should hold the folder of a tree that is linked no more', () => {
    const path = `${LINKED}/backend/src/main.ts`;

    expect(edit(join(first(), path))).toBe(asking(`${path}${POLICY_REASON}`));
  });
});

describe('beforeEdit, for an agent that gives a patch', () => {
  const root = (): string => bench.repository.root;
  const refusing = (reason: string): string =>
    answer('deny', `${reason} Stop and ask the owner.`);

  /** What the hook prints for a patch that an agent applies in a folder. */
  function patch(lines: readonly string[], folder = ''): string {
    const call = {
      tool_name: 'apply_patch',
      cwd: join(root(), folder),
      tool_input: {
        command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n'),
      },
    };
    return beforeEdit(JSON.stringify(call), root(), undefined);
  }

  it('should refuse a patch of a policy file, and tell the agent to ask', () => {
    const printed = patch([
      '*** Update File: harness/policy/limits.json',
      '@@',
    ]);

    expect(printed).toBe(
      refusing(`harness/policy/limits.json${POLICY_REASON}`),
    );
  });

  it.each(['Add File', 'Delete File', 'Move to'])(
    'should read the file of a line that says %s',
    (kind) => {
      expect(patch([`*** ${kind}: package.json`])).toBe(
        refusing(`package.json${POLICY_REASON}`),
      );
    },
  );

  it('should say nothing about a patch of code alone', () => {
    const lines = [
      '*** Update File: backend/src/main.ts',
      '@@',
      '-const a = 1;',
      '+const a = 2;',
      '*** Add File: backend/src/b.ts',
    ];

    expect(patch(lines)).toBe('');
  });

  it('should find the policy file among the files of one patch', () => {
    const lines = [
      '*** Update File: backend/src/main.ts',
      '*** Update File: harness/gate/steps.ts',
    ];

    expect(patch(lines)).toBe(
      refusing(`harness/gate/steps.ts${POLICY_REASON}`),
    );
  });

  it('should count a file from the folder the agent works in', () => {
    expect(patch(['*** Update File: tsconfig.json'], 'backend')).toBe(
      refusing(`backend/tsconfig.json${POLICY_REASON}`),
    );
    expect(patch(['*** Update File: ../package.json'], 'backend')).toBe(
      refusing(`package.json${POLICY_REASON}`),
    );
  });

  it('should not take a line of the code for a line that names a file', () => {
    const lines = [
      '*** Update File: backend/src/main.ts',
      '+const text = "*** Update File: package.json";',
      '+*** Updated File: package.json',
    ];

    expect(patch(lines)).toBe('');
  });

  it('should refuse a patch that names no file', () => {
    expect(patch(['@@', '+a'])).toContain('The patch names no file.');
  });

  it('should refuse a patch that comes with no folder', () => {
    const call = { tool_input: { command: '*** Update File: a.ts' } };

    expect(beforeEdit(JSON.stringify(call), root(), 'deny')).toContain(
      String.raw`\"cwd\" must be a string.`,
    );
  });

  it('should refuse and not ask when the way is anything but asking', () => {
    const call = { tool_input: { file_path: join(root(), 'package.json') } };

    expect(beforeEdit(JSON.stringify(call), root(), 'Ask')).toBe(
      refusing(`package.json${POLICY_REASON}`),
    );
  });
});
