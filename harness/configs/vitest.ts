import { defineConfig } from 'vitest/config';

/**
 * The unit and the integration tests of the harness, and what coverage
 * counts. The floors are not here: the coverage step takes them from the
 * policy.
 */
export const harnessTests = defineConfig({
  test: {
    include: [
      'harness/tests/unit/**/*.test.ts',
      'harness/tests/integration/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['harness/**/*.ts'],
      exclude: ['harness/fixtures/**', 'harness/tests/**'],
      reportsDirectory: 'coverage/harness',
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
