import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import {
  CACHE,
  MUTATION_TEST_SETTINGS,
} from '#tests/support/mutation-stand-ins';
import type { MutationRunRequest } from '#verification/application/ports/mutation-runner.port';
import {
  ignorePatternOf,
  listingConfigurationOf,
  mutatePatternOf,
  strykerConfigurationOf,
} from '#verification/infrastructure/mutation/stryker-configuration';

const REQUEST: MutationRunRequest = {
  workingCopyPath: '/work/copy',
  owner: 'improvement:7',
  testRunner: 'vitest',
  targetFile: FilePath.create('src/price.ts'),
  leftOutTestFiles: [
    FilePath.create('tests/feed.test.ts'),
    FilePath.create('tests/[id].test.ts'),
  ],
  timeoutMs: 900_000,
};

const LEFT_OUT = [
  '/.yarn/cache',
  '/tests/feed.test.ts',
  '/tests/[[]id[]].test.ts',
];

describe('mutatePatternOf', () => {
  it.each([
    ['src/price.ts', './src/price.ts'],
    ['src/[id].ts', './src/[[]id[]].ts'],
    ['src/[...slug].tsx', './src/[[]...slug[]].tsx'],
    ['src/a*b?.ts', './src/a[*]b[?].ts'],
    ['src/@(one).ts', './src/@[(]one[)].ts'],
    ['src/{a,b}.ts', './src/?a,b?.ts'],
    ['!first.ts', './!first.ts'],
  ])('should write %s as a pattern of itself, %s', (path, pattern) => {
    expect(mutatePatternOf(FilePath.create(path))).toBe(pattern);
  });
});

describe('ignorePatternOf', () => {
  it.each([
    ['tests/feed.test.ts', '/tests/feed.test.ts'],
    ['tests/[id].test.ts', '/tests/[[]id[]].test.ts'],
    ['!first.test.ts', '/!first.test.ts'],
  ])('should write %s as a pattern from the root, %s', (path, pattern) => {
    expect(ignorePatternOf(FilePath.create(path))).toBe(pattern);
  });
});

describe('strykerConfigurationOf', () => {
  it('should leave the files out of the sandbox, and end well with no test left', () => {
    const configuration = JSON.parse(
      strykerConfigurationOf(REQUEST, MUTATION_TEST_SETTINGS),
    ) as object;

    expect(configuration).toMatchObject({
      testRunner: 'vitest',
      ignorePatterns: LEFT_OUT,
      allowEmpty: true,
    });
  });
});

describe('listingConfigurationOf', () => {
  it('should run a command that passes in place of the runner, and cache nothing', () => {
    const configuration = JSON.parse(
      listingConfigurationOf(REQUEST, MUTATION_TEST_SETTINGS),
    ) as Record<string, unknown>;

    expect(configuration).toMatchObject({
      testRunner: 'command',
      commandRunner: { command: 'exit 0' },
      coverageAnalysis: 'off',
      incremental: false,
      mutate: ['./src/price.ts'],
      ignorePatterns: LEFT_OUT,
    });
    expect(configuration['incrementalFile']).toBeUndefined();
    expect(JSON.stringify(configuration)).not.toContain(CACHE);
  });
});
