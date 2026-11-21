import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import { mutatePatternOf } from '#verification/infrastructure/mutation/stryker-configuration';

describe('mutatePatternOf', () => {
  it.each([
    ['src/price.ts', './src/price.ts'],
    ['src/[id].ts', './src/[[]id[]].ts'],
    ['src/[...slug].tsx', './src/[[]...slug[]].tsx'],
    ['src/a*b?.ts', './src/a[*]b[?].ts'],
    ['src/@(one).ts', './src/@[(]one[)].ts'],
    ['src/{a,b}.ts', './src/?a,b?.ts'],
    ['!first.ts', './!first.ts'],
  ])('should write %s as a pattern of itself, %s', (path, pattern) => {
    expect(mutatePatternOf(FilePath.create(path))).toBe(pattern);
  });
});
