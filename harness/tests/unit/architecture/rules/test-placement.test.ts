import { describe, expect, it } from 'vitest';

import type { Finding } from '#harness/architecture/finding';
import { testPlacement } from '#harness/architecture/rules/test-placement';
import type { Structure } from '#harness/shared/structure';
import { structureOf } from '#harness/tests/support/policy-builder';
import { projectOfPaths } from '#harness/tests/support/project-builder';

const KINDS =
  'A test is of one kind: unit, integration, e2e. ' +
  'Each kind has its folder under tests/.';

function findings(
  paths: readonly string[],
  structure: Structure = structureOf(),
): readonly Finding[] {
  return testPlacement(structure).check(projectOfPaths(paths));
}

function details(...paths: readonly string[]): string[] {
  return findings(paths).map((finding) => finding.detail);
}

describe('testPlacement', () => {
  it('should report a test that is beside its source, on its first line', () => {
    const paths = [
      'backend/src/modules/store/domain/item.ts',
      'backend/src/modules/store/domain/item.test.ts',
    ];

    expect(findings(paths)).toEqual([
      {
        rule: 'test-placement',
        path: 'backend/src/modules/store/domain/item.test.ts',
        line: 1,
        detail: 'A test is kept under tests/, away from the source.',
      },
    ]);
  });

  it.each(['backend/item.test.ts', 'frontend/src/app/app.test.tsx'])(
    'should report %s, which is outside tests/',
    (path) => {
      expect(details(path)).toEqual([
        'A test is kept under tests/, away from the source.',
      ]);
    },
  );

  it('should pass a unit test that repeats the path of its source file', () => {
    expect(
      details(
        'backend/src/modules/store/domain/item.ts',
        'backend/tests/unit/modules/store/domain/item.test.ts',
      ),
    ).toEqual([]);
  });

  it('should report a unit test with no source file on the same path', () => {
    expect(
      details(
        'backend/src/modules/store/domain/item.ts',
        'backend/tests/unit/modules/store/item.test.ts',
      ),
    ).toEqual([
      'A unit test repeats the path of its source file, and ' +
        'backend/src/modules/store/item.ts is not there.',
    ]);
  });

  it('should not take the source of another workspace for its own', () => {
    expect(
      details('backend/src/main.ts', 'frontend/tests/unit/main.test.ts'),
    ).toHaveLength(1);
  });

  it.each([
    ['frontend/src/app/app.tsx', 'frontend/tests/unit/app/app.test.tsx'],
    ['frontend/src/app/app.tsx', 'frontend/tests/unit/app/app.test.ts'],
    [
      'frontend/src/theme/colors.ts',
      'frontend/tests/unit/theme/colors.test.tsx',
    ],
  ])('should find the source %s of the test %s', (source, test) => {
    expect(details(source, test)).toEqual([]);
  });

  it('should report a test among what the tests share', () => {
    expect(details('backend/tests/support/clock.test.ts')).toEqual([
      'tests/support/ holds what tests share, and no test.',
    ]);
    expect(details('backend/tests/support/fixed-clock.ts')).toEqual([]);
  });

  it.each([
    'backend/tests/item.test.ts',
    'backend/tests/unit.test.ts',
    'backend/tests/smoke/item.test.ts',
    'backend/tests/stress/queue.test.ts',
  ])('should report %s, which is of no kind the gate runs', (path) => {
    expect(details(path)).toEqual([KINDS]);
  });

  it.each([
    'backend/tests/integration/database.test.ts',
    'backend/tests/integration/deep/in/folders.test.ts',
    'frontend/tests/e2e/overview.test.tsx',
  ])('should pass %s: only a unit test repeats a path', (path) => {
    expect(details(path)).toEqual([]);
  });

  it('should judge the tests of the workspaces only', () => {
    expect(
      details(
        'harness/gate/steps.test.ts',
        'harness/tests/unit/gone.test.ts',
        'steps.test.ts',
        'docs/tests/unit/a.test.ts',
      ),
    ).toEqual([]);
  });

  it('should leave alone a file that only looks like a test', () => {
    expect(
      details(
        'backend/src/test.ts',
        'backend/src/latest.ts',
        'backend/tests/unit/a.test.ts.snap',
        'backend/src/a.test.js',
      ),
    ).toEqual([]);
  });

  it('should leave alone what the policy leaves out', () => {
    const structure = { ...structureOf(), excluded: ['backend/samples/'] };

    expect(findings(['backend/samples/a.test.ts'], structure)).toEqual([]);
    expect(findings(['backend/sample.test.ts'], structure)).toHaveLength(1);
  });
});
