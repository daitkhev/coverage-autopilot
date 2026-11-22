import { afterEach, describe, expect, it } from 'vitest';

import { listSourceFiles } from '#coverage/infrastructure/detection/source-file-list';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

const SOURCE = 'export const one = 1;\n';

const folders: ProjectFolder[] = [];

/** The list of a working copy that holds a source at each path. */
function listed(paths: readonly string[]): string[] {
  const folder = createProjectFolder(
    Object.fromEntries(paths.map((path) => [path, SOURCE])),
  );
  folders.push(folder);
  return listSourceFiles(folder.root).map((path) => path.value);
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('listSourceFiles', () => {
  describe('when a folder holds code that calls the product', () => {
    it.each([
      'examples',
      'example',
      'demos',
      'demo',
      'samples',
      'sample',
      'benchmarks',
      'benchmark',
      'bench',
      'fixtures',
      '__fixtures__',
    ])('should leave out a folder named %s at any depth', (name) => {
      const paths = [
        `${name}/a.ts`,
        `${name}/nested/b.ts`,
        `src/${name}/c.ts`,
        `docs/guide/${name}/d.ts`,
        'src/product.ts',
      ];

      expect(listed(paths)).toEqual(['src/product.ts']);
    });
  });

  describe('when a name merely holds such a word', () => {
    it('should list the file', () => {
      const paths = [
        'src/benchmarking/a.ts',
        'src/demo-mode/a.ts',
        'src/example-store.ts',
        'src/examples.ts',
        'src/my-fixtures/a.ts',
        'src/sampler/a.ts',
      ];

      expect(listed(paths)).toEqual(paths);
    });
  });

  describe('when a folder holds documentation or scripts', () => {
    it('should list its sources, which may be the product', () => {
      const paths = ['docs/site.ts', 'scripts/release.ts', 'src/scripts/a.ts'];

      expect(listed(paths)).toEqual(paths);
    });
  });
});
