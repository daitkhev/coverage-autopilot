import { describe, expect, it } from 'vitest';

import {
  keyLinesOf,
  topKeysOf,
} from '#coverage/infrastructure/detection/indented-keys';

describe('keyLinesOf', () => {
  describe('when keys are nested by their indent', () => {
    it('should give each key the keys above it, unquoted', () => {
      const text =
        "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies:\n" +
        "      '@vitest/coverage-v8':\n        version: 4.1.12\n  other:\n";

      expect(keyLinesOf(text)).toEqual([
        { path: ['lockfileVersion'], value: '9.0' },
        { path: ['importers'], value: null },
        { path: ['importers', '.'], value: null },
        { path: ['importers', '.', 'devDependencies'], value: null },
        {
          path: ['importers', '.', 'devDependencies', '@vitest/coverage-v8'],
          value: null,
        },
        {
          path: [
            'importers',
            '.',
            'devDependencies',
            '@vitest/coverage-v8',
            'version',
          ],
          value: '4.1.12',
        },
        { path: ['importers', 'other'], value: null },
      ]);
    });
  });

  describe('when a line is no key of a block mapping', () => {
    it('should skip a list, a comment and the start of a document, and drop a comment after a value', () => {
      const text =
        '# settings\nplugins:\n  - path: a.cjs\n---\nnodeLinker: node-modules # why\n';

      expect(keyLinesOf(text)).toEqual([
        { path: ['plugins'], value: null },
        { path: ['nodeLinker'], value: 'node-modules' },
      ]);
    });
  });

  describe('when a key or a value is quoted', () => {
    it('should keep what the quotes hold, a colon or a hash among it', () => {
      const text = '"chalk@npm:4.1.2, chalk@npm:^4":\n  checksum: "a#b"\n';

      expect(keyLinesOf(text)).toEqual([
        { path: ['chalk@npm:4.1.2, chalk@npm:^4'], value: null },
        { path: ['chalk@npm:4.1.2, chalk@npm:^4', 'checksum'], value: 'a#b' },
      ]);
    });
  });
});

describe('topKeysOf', () => {
  it('should give the keys at the top of every document', () => {
    expect(
      topKeysOf('packages:\n  - a\nsettings:\n  b: 1\n---\nnodeLinker: pnp\n'),
    ).toEqual(new Set(['packages', 'settings', 'nodeLinker']));
  });
});
