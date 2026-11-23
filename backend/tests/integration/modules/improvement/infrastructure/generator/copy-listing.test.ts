import { chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  changesBetween,
  listCopy,
} from '#improvement/infrastructure/generator/copy-listing';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

let folder: ProjectFolder;
let outside: ProjectFolder;

beforeEach(() => {
  folder = createProjectFolder({
    'src/a.ts': 'a',
    'src/deep/b.ts': 'b',
    'node_modules/left/index.js': 'left',
    'src/node_modules/inner.js': 'inner',
  });
  outside = createProjectFolder({ 'secret.txt': 'outside' });
});

afterEach(() => {
  folder.remove();
  outside.remove();
});

describe('listCopy', () => {
  it('should list every entry that is not a folder, by its path in the copy', async () => {
    const listing = await listCopy(folder.root);

    expect([...listing.keys()].sort()).toEqual(['src/a.ts', 'src/deep/b.ts']);
  });

  it('should list a link as an entry and never follow it', async () => {
    symlinkSync(outside.root, join(folder.root, 'linked-folder'));
    symlinkSync(
      join(outside.root, 'secret.txt'),
      join(folder.root, 'src/linked.ts'),
    );

    const listing = await listCopy(folder.root);

    expect([...listing.keys()].sort()).toEqual([
      'linked-folder',
      'src/a.ts',
      'src/deep/b.ts',
      'src/linked.ts',
    ]);
  });
});

describe('changesBetween', () => {
  it('should find nothing between two listings of an unchanged copy', async () => {
    const before = await listCopy(folder.root);

    expect(changesBetween(before, await listCopy(folder.root))).toEqual({
      any: false,
      written: [],
    });
  });

  it('should name what was added or changed, sorted', async () => {
    const before = await listCopy(folder.root);
    folder.write('tests/z.test.ts', 'z');
    folder.write('src/a.ts', 'a longer a');
    chmodSync(join(folder.root, 'src/deep/b.ts'), 0o600);

    expect(changesBetween(before, await listCopy(folder.root))).toEqual({
      any: true,
      written: ['src/a.ts', 'src/deep/b.ts', 'tests/z.test.ts'],
    });
  });

  it('should count a removal as a change with nothing written', () => {
    const before = new Map([['src/a.ts', '1:1:1']]);

    expect(changesBetween(before, new Map())).toEqual({
      any: true,
      written: [],
    });
  });
});
