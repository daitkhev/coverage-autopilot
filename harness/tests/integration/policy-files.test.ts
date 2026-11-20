import { describe, expect, it } from '@jest/globals';

import { readLimits, readStructure } from '#harness/shared/policy';

describe('readStructure', () => {
  it('should read what is measured and which names are refused', () => {
    const structure = readStructure();

    expect(structure.extensions).toContain('.ts');
    expect(structure.excluded).toContain('harness/fixtures/');
    expect(structure.bannedNames).toEqual(
      expect.arrayContaining(['index', 'utils', 'helpers', 'common', 'misc']),
    );
  });
});

describe('readLimits', () => {
  it('should read the limits the design agreed on', () => {
    expect(readLimits()).toEqual({
      functionLines: 50,
      functionBranches: 8,
      functionDepth: 3,
      functionParameters: 3,
      fileLines: 300,
    });
  });
});
