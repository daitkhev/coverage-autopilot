/**
 * The script of every tool the gate starts, from the root of the
 * repository. A tool is started by its path, never through a script of
 * `package.json`, so no change of that file can swap what runs.
 */
export const TOOLS = {
  '@commitlint/cli': 'node_modules/@commitlint/cli/cli.js',
  '@stryker-mutator/core': 'node_modules/@stryker-mutator/core/bin/stryker.js',
  eslint: 'node_modules/eslint/bin/eslint.js',
  jest: 'node_modules/jest/bin/jest.js',
  jscpd: 'node_modules/jscpd/run-jscpd.js',
  knip: 'node_modules/knip/bin/knip.js',
  'markdownlint-cli2':
    'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs',
  prettier: 'node_modules/prettier/bin/prettier.cjs',
  typescript: 'node_modules/typescript/bin/tsc',
  vitest: 'node_modules/vitest/vitest.mjs',
} as const;

/** Packages a tool loads by their name, so nothing imports them. */
export const TOOL_PLUGINS = [
  '@stryker-mutator/vitest-runner',
  '@vitest/coverage-v8',
];

/** Packages the Jest fixture project loads when Jest is started on it. */
export const FIXTURE_PACKAGES = ['@jest/globals', '@swc/core', '@swc/jest'];

/** The unit and the integration tests of the harness. */
export const TESTS_CONFIG = 'vitest.config.mjs';

/** The tests that start the real runners on the fixture projects. */
export const RUNNERS_CONFIG = 'vitest.runners.config.mjs';
