import { describe, expect, it } from 'vitest';

import { areasOf, testFolders } from '#harness/gate/areas';
import { structureOf } from '#harness/tests/support/policy-builder';

describe('areasOf', () => {
  it('should give the harness first, with its tests under its own folder', () => {
    expect(areasOf(structureOf())[0]).toEqual({
      name: 'harness',
      source: 'harness/',
      tests: 'harness/tests/',
      leftOut: ['harness/tests/'],
    });
  });

  it('should give every workspace of the policy, by its name', () => {
    expect(areasOf(structureOf()).slice(1)).toEqual([
      {
        name: 'backend',
        source: 'backend/src/',
        tests: 'backend/tests/',
        leftOut: [],
      },
      {
        name: 'frontend',
        source: 'frontend/src/',
        tests: 'frontend/tests/',
        leftOut: [],
      },
    ]);
  });
});

describe('testFolders', () => {
  it('should name the folder of one kind of tests in every area', () => {
    expect(testFolders(areasOf(structureOf()), 'integration')).toEqual([
      'harness/tests/integration',
      'backend/tests/integration',
      'frontend/tests/integration',
    ]);
  });
});
