import { describe, expect, it } from 'vitest';

import { type FrozenPolicy, isFrozen } from '#harness/shared/frozen';

const POLICY: FrozenPolicy = {
  places: ['harness/', '.github/', '*'],
  names: ['tsconfig*.json'],
  free: ['harness/baseline.json', 'README.md'],
  withPolicy: [],
};

describe('isFrozen', () => {
  it.each([
    ['a rule of the harness', 'harness/policy/limits.json'],
    ['a test of the harness', 'harness/tests/unit/a.test.ts'],
    ['a workflow', '.github/workflows/ci.yml'],
    ['a file at the root', 'package.json'],
    ['a hidden file at the root', '.npmrc'],
    ['the compiler settings of a workspace', 'backend/tsconfig.json'],
    [
      'compiler settings deep in a workspace',
      'backend/src/tsconfig.build.json',
    ],
  ])('should say that %s is policy', (_, path) => {
    expect(isFrozen(path, POLICY)).toBe(true);
  });

  it.each([
    ['the code of a workspace', 'backend/src/main.ts'],
    ['the package list of a workspace', 'backend/package.json'],
    ['a document', 'docs/plan/harness.md'],
    ['a file that is free inside a frozen place', 'harness/baseline.json'],
    ['a file that is free at the root', 'README.md'],
    [
      'a file whose name only ends like a frozen one',
      'backend/my-tsconfig.json',
    ],
    [
      'a file whose name only starts like a frozen one',
      'backend/tsconfig.json.ts',
    ],
  ])('should say that %s is not policy', (_, path) => {
    expect(isFrozen(path, POLICY)).toBe(false);
  });

  it('should not free a file that only has the name of a free one', () => {
    expect(isFrozen('harness/README.md', POLICY)).toBe(true);
  });
});
