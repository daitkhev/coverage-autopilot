import { describe, expect, it } from '@jest/globals';

import { hasRuntimeCode, measuredFiles } from '#harness/gate/coverage-files';
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
  const command = coverageCommand({
    statements: 95,
    branches: 94,
    functions: 93,
    lines: 92,
  });

  it('should give Jest the floors of the policy', () => {
    const at = command.arguments.indexOf('--coverageThreshold');

    expect(JSON.parse(command.arguments[at + 1] ?? '')).toEqual({
      global: { statements: 95, branches: 94, functions: 93, lines: 92 },
    });
  });

  it('should count the unit and the integration tests together', () => {
    expect(command.arguments.slice(-2)).toEqual([
      'harness/tests/unit',
      'harness/tests/integration',
    ]);
    expect(command.arguments).toContain('--coverage');
    expect(command.arguments).toContain('--ci');
  });

  it('should start Jest by its path, in the mode for ES modules', () => {
    expect(command.script).toBe('node_modules/jest/bin/jest.js');
    expect(command.nodeOptions).toContain('--experimental-vm-modules');
  });
});
