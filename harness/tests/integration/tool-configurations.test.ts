import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { harnessTests, runnerTests } from '#harness/configs/vitest';
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
  it('should run the unit and the integration tests, and measure the harness', () => {
    expect(harnessTests).toEqual({
      test: {
        include: [
          'harness/tests/unit/**/*.test.ts',
          'harness/tests/integration/**/*.test.ts',
        ],
        environment: 'node',
        coverage: {
          provider: 'v8',
          include: ['harness/**/*.ts'],
          exclude: [FIXTURES, 'harness/tests/**'],
          reportsDirectory: 'coverage/harness',
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
    ['vitest.config.mjs', 'harnessTests'],
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
