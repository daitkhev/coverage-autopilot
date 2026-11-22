import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

import { ENVIRONMENT_BAN, syntaxBans } from '#harness/eslint/restricted-syntax';
import { readLimits, REPOSITORY_ROOT } from '#harness/shared/policy';

const limits = readLimits();
const counted = { skipBlankLines: true, skipComments: true };

const IMPORT_GROUPS = [
  ['^node:'],
  ['^@?\\w'],
  ['^@coverage-autopilot/'],
  ['^#'],
];

const shape: Linter.RulesRecord = {
  'max-lines-per-function': [
    'error',
    { max: limits.functionLines, ...counted },
  ],
  'max-lines': ['error', { max: limits.fileLines, ...counted }],
  complexity: ['error', limits.functionBranches],
  'max-depth': ['error', limits.functionDepth],
  'max-classes-per-file': ['error', 1],
  'no-nested-ternary': 'error',
  'no-restricted-syntax': ['error', ...syntaxBans(limits.functionParameters)],
};

const language: Linter.RulesRecord = {
  'id-denylist': ['error', 'Result', 'Either'],
  'no-console': 'error',
  'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack'] }],
  'no-restricted-exports': [
    'error',
    {
      restrictDefaultExports: { direct: true, named: true, defaultFrom: true },
    },
  ],
  'simple-import-sort/imports': ['error', { groups: IMPORT_GROUPS }],
  'simple-import-sort/exports': 'error',
};

/** A test that runs alone or does not run hides the rest of the suite. */
const testing: Linter.RulesRecord = {
  'vitest/no-focused-tests': 'error',
  'vitest/no-disabled-tests': 'error',
};

const typed: Linter.RulesRecord = {
  '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/explicit-member-accessibility': 'error',
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  '@typescript-eslint/strict-boolean-expressions': 'error',
  '@typescript-eslint/no-magic-numbers': [
    'error',
    {
      ignore: [-1, 0, 1],
      ignoreArrayIndexes: true,
      ignoreEnums: true,
      ignoreNumericLiteralTypes: true,
      ignoreReadonlyClassProperties: true,
      ignoreTypeIndexes: true,
    },
  ],
};

/** The rules this policy adds to the sets it starts from. */
export const addedRuleIds: string[] = Object.keys({
  ...shape,
  ...language,
  ...testing,
  ...typed,
});

/** The lint policy itself, with nothing ignored. Fixtures are linted by it. */
export const lintPolicy: Linter.Config[] = defineConfig(
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    plugins: { 'simple-import-sort': simpleImportSort, vitest },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: REPOSITORY_ROOT },
    },
    rules: { ...shape, ...language, ...testing, ...typed },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-restricted-exports': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
);

/**
 * The only files that read the environment: the host of the gate, the
 * entry file of the service, the entry file of the client, and the
 * stand-in of the container engine, a program of the tests that is there
 * to record the environment it was started with. Every other file gets a
 * value.
 */
const ENVIRONMENT_READERS = [
  'harness/gate/host.ts',
  'backend/src/main.ts',
  'frontend/src/main.tsx',
  'backend/tests/support/stand-in-engine.ts',
];

/** Every banned shape of code but the read of the environment. */
const bansOfAReader = syntaxBans(limits.functionParameters).filter(
  (ban) => ban !== ENVIRONMENT_BAN,
);

/** What the gate runs: the policy, with generated and fixture files left out. */
export const eslintConfig: Linter.Config[] = defineConfig(
  {
    ignores: [
      'node_modules/',
      'coverage/',
      '*/coverage/',
      'reports/',
      '.stryker-tmp/',
      'dist/',
      '*/dist/',
      'docs/',
      'harness/fixtures/',
      '.claude/worktrees/',
    ],
  },
  ...lintPolicy,
  {
    files: ENVIRONMENT_READERS,
    rules: { 'no-restricted-syntax': ['error', ...bansOfAReader] },
  },
);
