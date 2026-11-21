import { describe, expect, it } from 'vitest';

import { type Area, areasOf } from '#harness/gate/areas';
import {
  hasRuntimeCode,
  leftOutOf,
  measuredFiles,
} from '#harness/gate/coverage-files';
import type { NodeCommand } from '#harness/gate/host';
import { coverageCommand, coverageReport } from '#harness/gate/run-coverage';
import { HarnessError } from '#harness/shared/harness.error';
import type { Structure } from '#harness/shared/structure';
import { structureOf } from '#harness/tests/support/policy-builder';

const structure: Structure = {
  ...structureOf(),
  excluded: ['harness/fixtures/'],
};

const [harness, backend] = areasOf(structure);

function inTest(area: Area | undefined): Area {
  if (area === undefined) {
    throw new HarnessError('The policy of the test has no such area.');
  }
  return area;
}

describe('measuredFiles', () => {
  const files = [
    'harness/bin/check.ts',
    'harness/gate/steps.ts',
    'harness/policy/limits.json',
    'harness/tests/unit/gate/steps.test.ts',
    'harness/tests/support/fake-host.ts',
    'harness/fixtures/lint/wrong/then-call.ts',
    'backend/package.json',
    'backend/src/main.ts',
    'backend/src/modules/store/store.module.ts',
    'backend/src/notes.md',
    'backend/tests/unit/main.test.ts',
    'backend/migrations/0001-first.sql',
    'frontend/src/app/app.tsx',
    'eslint.config.mjs',
  ];

  it('should take the source of the harness and leave the rest out', () => {
    expect(measuredFiles(files, inTest(harness), structure)).toEqual([
      'harness/bin/check.ts',
      'harness/gate/steps.ts',
    ]);
  });

  it('should take the source of a workspace, and nothing beside it', () => {
    expect(measuredFiles(files, inTest(backend), structure)).toEqual([
      'backend/src/main.ts',
      'backend/src/modules/store/store.module.ts',
    ]);
  });
});

describe('leftOutOf', () => {
  it('should leave out the tests and the fixtures of the harness', () => {
    expect(leftOutOf(inTest(harness), structure)).toEqual([
      'harness/tests/',
      'harness/fixtures/',
    ]);
  });

  it('should leave nothing out of a workspace', () => {
    expect(leftOutOf(inTest(backend), structure)).toEqual([]);
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
  const floors = { statements: 95, branches: 94, functions: 93, lines: 92 };
  const command = (area = harness): NodeCommand =>
    coverageCommand(inTest(area), floors, structure);

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

  it('should measure the source of the harness, without what is left out', () => {
    expect(command().arguments.slice(4, 8)).toEqual([
      '--coverage.include=harness/**/*.{ts,tsx}',
      '--coverage.exclude=harness/tests/**',
      '--coverage.exclude=harness/fixtures/**',
      '--coverage.reportsDirectory=coverage/harness',
    ]);
  });

  it('should measure a workspace by its own tests, in its own report', () => {
    expect(command(backend).arguments.slice(4, 6)).toEqual([
      '--coverage.include=backend/src/**/*.{ts,tsx}',
      '--coverage.reportsDirectory=coverage/backend',
    ]);
    expect(command(backend).arguments.slice(-2)).toEqual([
      'backend/tests/unit',
      'backend/tests/integration',
    ]);
  });

  it('should start Vitest by its path, with no option of Node', () => {
    expect(command().script).toBe('node_modules/vitest/vitest.mjs');
    expect(command().nodeOptions).toEqual([]);
  });
});

describe('coverageReport', () => {
  it('should name the report of an area by the area', () => {
    expect(coverageReport(inTest(backend))).toBe(
      'coverage/backend/coverage-final.json',
    );
  });
});
