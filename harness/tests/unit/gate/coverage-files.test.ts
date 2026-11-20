import { describe, expect, it } from 'vitest';

import { hasRuntimeCode, measuredFiles } from '#harness/gate/coverage-files';
import type { NodeCommand } from '#harness/gate/host';
import { coverageCommand } from '#harness/gate/run-coverage';
import type { Structure } from '#harness/shared/structure';
import { structureOf } from '#harness/tests/support/policy-builder';

const structure: Structure = {
  ...structureOf(),
  excluded: ['harness/fixtures/'],
};

describe('measuredFiles', () => {
  it('should take the source of the harness and leave the rest out', () => {
    const files = [
      'harness/bin/check.ts',
      'harness/gate/steps.ts',
      'harness/policy/limits.json',
      'harness/tests/unit/gate/steps.test.ts',
      'harness/tests/support/fake-host.ts',
      'harness/fixtures/lint/wrong/then-call.ts',
      'backend/src/main.ts',
      'eslint.config.mjs',
    ];

    expect(measuredFiles(files, structure)).toEqual([
      'harness/bin/check.ts',
      'harness/gate/steps.ts',
    ]);
  });
});

describe('hasRuntimeCode', () => {
  it('should find nothing to run in a file of types alone', () => {
    const text = [
      "import type { A } from '#harness/a';",
      "export type { B } from '#harness/b';",
      'export interface C { readonly a: A }',
      'export type D = C | undefined;',
    ].join('\n');

    expect(hasRuntimeCode('a.ts', text)).toBe(false);
    expect(hasRuntimeCode('a.ts', '')).toBe(false);
  });

  it.each([
    'export const a = 1;',
    'export function a(): void {}',
    "import { a } from '#harness/a';",
    "export { a } from '#harness/a';",
    "import '#harness/a';",
    'export interface A {}\nexport class B {}',
  ])('should find something to run in: %s', (text) => {
    expect(hasRuntimeCode('a.ts', text)).toBe(true);
  });
});

describe('coverageCommand', () => {
  const command = (): NodeCommand =>
    coverageCommand({ statements: 95, branches: 94, functions: 93, lines: 92 });

  it('should give Vitest the floors of the policy', () => {
    expect(command().arguments).toEqual(
      expect.arrayContaining([
        '--coverage.thresholds.statements=95',
        '--coverage.thresholds.branches=94',
        '--coverage.thresholds.functions=93',
        '--coverage.thresholds.lines=92',
      ]),
    );
  });

  it('should count the unit and the integration tests together', () => {
    expect(command().arguments.slice(-2)).toEqual([
      'harness/tests/unit',
      'harness/tests/integration',
    ]);
    expect(command().arguments).toContain('--coverage.enabled');
    expect(command().arguments.slice(0, 3)).toEqual([
      'run',
      '--config',
      'vitest.config.mjs',
    ]);
  });

  it('should start Vitest by its path, with no option of Node', () => {
    expect(command().script).toBe('node_modules/vitest/vitest.mjs');
    expect(command().nodeOptions).toEqual([]);
  });
});
