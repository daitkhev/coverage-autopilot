import { defineConfig } from 'vitest/config';

/**
 * The unit and the integration tests of the harness and of every
 * workspace. A folder of tests is one level below the root, so the tests
 * of a fixture project and of a linked tree are not among them.
 *
 * What coverage counts is not here, and neither are the floors: the
 * coverage step measures one area at a time and gives both to Vitest.
 *
 * A test may take twenty seconds. An integration test starts real
 * programs, such as git, and on a machine that runs several gates at once
 * one of them took more than the five seconds Vitest gives by default.
 */
export const treeTests = defineConfig({
  test: {
    include: [
      '*/tests/unit/**/*.test.{ts,tsx}',
      '*/tests/integration/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['json', 'text-summary'],
    },
  },
});

/**
 * The tests that start the real test runners on the fixture projects.
 * They run no code of the harness, so coverage and mutation leave them
 * out.
 */
export const runnerTests = defineConfig({
  test: {
    include: ['harness/tests/runners/**/*.test.ts'],
    environment: 'node',
  },
});
