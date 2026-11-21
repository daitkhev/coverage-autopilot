import { defineConfig } from 'vitest/config';

/**
 * The unit and the integration tests of the harness and of every
 * workspace. A folder of tests is one level below the root, so the tests
 * of a fixture project and of a linked tree are not among them.
 *
 * What coverage counts is not here, and neither are the floors: the
 * coverage step measures one area at a time and gives both to Vitest.
 */
export const treeTests = defineConfig({
  test: {
    include: [
      '*/tests/unit/**/*.test.{ts,tsx}',
      '*/tests/integration/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
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
