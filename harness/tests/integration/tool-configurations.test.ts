import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runnerTests, treeTests } from '#harness/configs/vitest';
import { eslintConfig } from '#harness/eslint/config';
import { FIXTURE_PACKAGES, TOOL_PLUGINS, TOOLS } from '#harness/gate/tools';
import { isRecord, readJsonRecord, recordAt } from '#harness/shared/json';
import { readMutationRuns } from '#harness/shared/mutation-policy';
import { HARNESS_ROOT, REPOSITORY_ROOT } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

function config(name: string): Record<string, unknown> {
  return readJsonRecord(join(HARNESS_ROOT, 'configs', name));
}

const FIXTURES = 'harness/fixtures/**';

describe('the tools of the gate', () => {
  it.each(Object.entries(TOOLS))('should find %s at its path', (_, script) => {
    expect(existsSync(join(REPOSITORY_ROOT, script))).toBe(true);
  });

  it('should have each of them as an exact dependency of the root', () => {
    const root = readJsonRecord(join(REPOSITORY_ROOT, 'package.json'));
    const declared = Object.keys(recordAt(root, 'devDependencies'));

    expect(declared).toEqual(
      expect.arrayContaining([...Object.keys(TOOLS), ...TOOL_PLUGINS]),
    );
  });
});

/**
 * An agent that works beside others gets a tree of its own under this
 * folder. It is another copy of the repository, on another branch, and
 * it is judged where it stands, never as a part of the first tree.
 */
describe('the folder of the linked trees', () => {
  const LINKED_TREES = '.claude/worktrees/';

  it.each(['.gitignore', '.prettierignore'])(
    'should be left out by %s',
    (name) => {
      const lines = readFileSync(join(REPOSITORY_ROOT, name), 'utf8');

      expect(lines.split('\n')).toContain(LINKED_TREES);
    },
  );

  it('should be left out by the linter', () => {
    expect(eslintConfig[0]?.ignores).toContain(LINKED_TREES);
  });
});

describe('knip.json', () => {
  const workspaces = (): Record<string, unknown> =>
    recordAt(config('knip.json'), 'workspaces');
  const root = (): Record<string, unknown> => recordAt(workspaces(), '.');

  it('should leave out of the root only the fixtures', () => {
    expect(root()['ignore']).toEqual([FIXTURES]);
  });

  it('should excuse only the tools the gate starts, and what they load', () => {
    const excused = [
      ...Object.keys(TOOLS),
      ...TOOL_PLUGINS,
      ...FIXTURE_PACKAGES,
    ];

    expect(excused).toEqual(
      expect.arrayContaining(root()['ignoreDependencies'] as string[]),
    );
  });

  it('should know every workspace of the policy, and ignore none', () => {
    const names = ['.', ...readStructure().workspaces.keys()].sort();

    expect(Object.keys(workspaces()).sort()).toEqual(names);
    for (const name of readStructure().workspaces.keys()) {
      const workspace = recordAt(workspaces(), name);

      expect(Object.keys(workspace).sort()).toEqual(['entry', 'project']);
    }
  });

  it('should switch off nothing at the top of the file', () => {
    expect(Object.keys(config('knip.json'))).toEqual(['workspaces']);
  });
});

describe('jscpd.json', () => {
  it('should read every TypeScript file but the fixtures', () => {
    expect(config('jscpd.json')).toEqual({
      pattern: '**/*.{ts,tsx}',
      ignore: ['**/node_modules/**', FIXTURES],
      reporters: ['console'],
      gitignore: true,
    });
  });
});

describe('vitest.ts', () => {
  it('should run the unit and the integration tests of every area', () => {
    expect(treeTests).toEqual({
      test: {
        include: [
          '*/tests/unit/**/*.test.{ts,tsx}',
          '*/tests/integration/**/*.test.{ts,tsx}',
        ],
        environment: 'node',
        testTimeout: 20_000,
        hookTimeout: 20_000,
        coverage: {
          provider: 'v8',
          reporter: ['json', 'text-summary'],
        },
      },
    });
  });

  it('should run the tests of the runners apart, and measure nothing there', () => {
    expect(runnerTests).toEqual({
      test: {
        include: ['harness/tests/runners/**/*.test.ts'],
        environment: 'node',
      },
    });
  });

  it.each([
    ['vitest.config.mjs', 'treeTests'],
    ['vitest.runners.config.mjs', 'runnerTests'],
  ])('should be what %s at the root points to', (pointer, name) => {
    const text = readFileSync(join(REPOSITORY_ROOT, pointer), 'utf8');

    expect(text).toBe(
      `export { ${name} as default } from '#harness/configs/vitest';\n`,
    );
  });
});

describe('markdownlint.json', () => {
  const rules = (): Record<string, unknown> =>
    recordAt(config('markdownlint.json'), 'config');

  it('should start from every rule and switch none off', () => {
    expect(rules()['default']).toBe(true);
    expect(Object.values(rules()).filter((value) => value === false)).toEqual(
      [],
    );
  });

  it('should hold a line at 80 characters, tables and code aside', () => {
    expect(rules()['MD013']).toEqual({
      line_length: 80,
      tables: false,
      code_blocks: false,
    });
    expect(isRecord(rules()['MD013'])).toBe(true);
  });
});

describe('the configurations of the tools that are programs', () => {
  const text = (name: string): string =>
    readFileSync(join(HARNESS_ROOT, 'configs', name), 'utf8');

  it('should search for secrets with every rule of the tool, and no other', () => {
    expect(text('gitleaks.toml')).toBe('[extend]\nuseDefault = true\n');
  });

  it('should keep no list of accepted secrets', () => {
    expect(existsSync(join(HARNESS_ROOT, 'configs/.gitleaksignore'))).toBe(
      false,
    );
  });

  it('should accept one finding of zizmor: the event of the frozen check', () => {
    const lines = text('zizmor.yml')
      .split('\n')
      .filter((line) => line !== '' && !line.trim().startsWith('#'));

    expect(lines).toEqual([
      'rules:',
      '  dangerous-triggers:',
      '    ignore:',
      '      - frozen.yml',
    ]);
  });

  it('should switch nothing off in actionlint', () => {
    expect(text('actionlint.yaml')).toBe('self-hosted-runner:\n  labels: []\n');
  });
});

describe('stryker.json', () => {
  const stryker = (): Record<string, unknown> => config('stryker.json');

  it('should mutate the whole harness but its commands, hooks, fixtures and tests', () => {
    expect(stryker()['mutate']).toEqual([
      'harness/**/*.ts',
      '!harness/bin/**',
      '!harness/agents/hooks/**',
      '!harness/fixtures/**',
      '!harness/tests/**',
    ]);
  });

  it('should write the report where the policy says it is read', () => {
    const [run] = readMutationRuns();

    expect(recordAt(stryker(), 'jsonReporter')['fileName']).toBe(run?.report);
    expect(stryker()['reporters']).toContain('json');
  });

  it('should switch off no mutant and no kind of mutant', () => {
    const allowed = [
      'coverageAnalysis',
      'disableTypeChecks',
      'inPlace',
      'jsonReporter',
      'mutate',
      'reporters',
      'tempDirName',
      'testRunner',
      'vitest',
    ];

    expect(Object.keys(stryker()).sort()).toEqual(allowed);
  });

  it('should not add a line to the files of the fixtures', () => {
    expect(stryker()['disableTypeChecks']).toBe(false);
  });

  it('should leave what a run may take of the machine to its settings', () => {
    expect(stryker()['concurrency']).toBeUndefined();
    expect(stryker()['testRunnerNodeArgs']).toBeUndefined();
    expect(stryker()['timeoutMS']).toBeUndefined();
  });

  it('should run the tests through the configuration of the gate', () => {
    expect(stryker()['testRunner']).toBe('vitest');
    expect(stryker()['vitest']).toEqual({ configFile: 'vitest.config.mjs' });
  });
});
