import { describe, expect, it } from 'vitest';

import {
  type Alias,
  aliasesOf,
  kindOf,
  resolveAlias,
} from '#harness/architecture/aliases';

describe('aliasesOf', () => {
  it('should read a pattern from the root manifest', () => {
    const manifest = { imports: { '#harness/*': './harness/*.ts' } };

    expect(aliasesOf(manifest, '')).toEqual([
      { prefix: '#harness/', pattern: true, head: 'harness/', tail: '.ts' },
    ]);
  });

  it('should place a pattern under the folder of its manifest', () => {
    const manifest = { imports: { '#kernel/*': './src/shared/kernel/*.ts' } };

    expect(aliasesOf(manifest, 'backend')[0]?.head).toBe(
      'backend/src/shared/kernel/',
    );
  });

  it('should read an exact entry', () => {
    const manifest = { imports: { '#main': './src/main.ts' } };

    expect(aliasesOf(manifest, '')).toEqual([
      { prefix: '#main', pattern: false, head: 'src/main.ts', tail: '' },
    ]);
  });

  describe('when the manifest declares nothing usable', () => {
    it('should give no alias for a manifest without imports', () => {
      expect(aliasesOf({ name: 'x' }, '')).toEqual([]);
    });

    it('should give no alias for something that is not an object', () => {
      expect(aliasesOf('text', '')).toEqual([]);
    });

    it('should skip an entry whose target is not a string', () => {
      const manifest = { imports: { '#a/*': { node: './a/*.ts' } } };

      expect(aliasesOf(manifest, '')).toEqual([]);
    });
  });
});

describe('resolveAlias', () => {
  const aliases = (): Alias[] =>
    aliasesOf(
      { imports: { '#src/*': './src/*.ts', '#main': './src/main.ts' } },
      '',
    );

  it('should name the file behind a pattern', () => {
    expect(resolveAlias('#src/domain/a', aliases())).toBe('src/domain/a.ts');
  });

  it('should name the file behind an exact entry', () => {
    expect(resolveAlias('#main', aliases())).toBe('src/main.ts');
  });

  it('should give nothing for an alias that is not declared', () => {
    expect(resolveAlias('#other/a', aliases())).toBeUndefined();
  });

  it('should not let a path climb out with dots', () => {
    expect(resolveAlias('#src/../secret', aliases())).toBe('secret.ts');
  });
});

describe('kindOf', () => {
  it('should tell the four kinds apart', () => {
    expect(kindOf('./b')).toBe('relative');
    expect(kindOf('..')).toBe('relative');
    expect(kindOf('#src/b')).toBe('alias');
    expect(kindOf('node:fs')).toBe('builtin');
    expect(kindOf('typescript')).toBe('package');
    expect(kindOf('@scope/name')).toBe('package');
  });
});
