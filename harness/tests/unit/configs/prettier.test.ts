import { describe, expect, it } from '@jest/globals';

import { prettierConfig } from '#harness/configs/prettier';

describe('prettierConfig', () => {
  it('should hold the formatting the project agreed on', () => {
    expect(prettierConfig).toEqual({
      printWidth: 80,
      tabWidth: 2,
      singleQuote: true,
      trailingComma: 'all',
      semi: true,
      endOfLine: 'lf',
    });
  });
});
