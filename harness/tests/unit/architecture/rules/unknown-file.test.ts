import { describe, expect, it } from 'vitest';

import { unknownFile } from '#harness/architecture/rules/unknown-file';
import type { Structure } from '#harness/shared/structure';
import { structureOf } from '#harness/tests/support/policy-builder';
import { projectOfPaths } from '#harness/tests/support/project-builder';

const LINK = '.agent/settings.json';
const TARGET = '../harness/settings.json';
const NOT_AT_ROOT = 'A workspace does not have this file at its root.';

function detailsWith(
  structure: Structure,
  paths: readonly string[],
  links: Readonly<Record<string, string>> = {},
): string[] {
  return unknownFile(structure)
    .check(projectOfPaths(paths, links))
    .map((finding) => finding.detail);
}

function detailsOf(...paths: readonly string[]): string[] {
  return detailsWith(structureOf(), paths);
}

describe('unknownFile', () => {
  describe('a file of a workspace', () => {
    it('should pass the files the policy lists for each place', () => {
      expect(
        detailsOf(
          'backend/package.json',
          'backend/tsconfig.json',
          'backend/src/main.ts',
          'backend/src/modules/store/domain/entities/run.entity.ts',
          'backend/tests/unit/main.test.ts',
          'backend/migrations/0001-first.sql',
          'frontend/src/app/main.tsx',
          'frontend/src/app/keys.ts',
        ),
      ).toEqual([]);
    });

    it('should report a file the root of a workspace does not have', () => {
      expect(
        unknownFile(structureOf()).check(
          projectOfPaths(['backend/vitest.config.ts']),
        ),
      ).toEqual([
        {
          rule: 'unknown-file',
          path: 'backend/vitest.config.ts',
          line: 1,
          detail: NOT_AT_ROOT,
        },
      ]);
    });

    it.each(['backend/.eslintrc.json', 'backend/.npmrc', 'frontend/README.md'])(
      'should report %s',
      (path) => {
        expect(detailsOf(path)).toEqual([NOT_AT_ROOT]);
      },
    );

    it('should not take a root file of one workspace for a file of another', () => {
      const structure: Structure = {
        ...structureOf(),
        workspaceFiles: new Map([
          ['backend', new Map([['', ['only-here.json']]])],
          ['frontend', new Map([['', ['tsconfig.json']]])],
        ]),
      };

      expect(
        detailsWith(structure, [
          'backend/only-here.json',
          'frontend/only-here.json',
        ]),
      ).toEqual([NOT_AT_ROOT]);
    });

    it('should report every root file when the policy lists none', () => {
      const structure: Structure = {
        ...structureOf(),
        workspaceFiles: new Map([['backend', new Map([['src/', ['.ts']]])]]),
      };

      expect(
        detailsWith(structure, ['backend/tsconfig.json', 'backend/src/a.ts']),
      ).toEqual([NOT_AT_ROOT]);
    });

    it('should not take a listed root file below the root for known', () => {
      expect(detailsOf('backend/src/tsconfig.json')).toEqual([
        'A file of this kind does not belong in "src/".',
      ]);
    });

    it('should report a file of a kind its folder does not hold', () => {
      expect(
        detailsOf(
          'backend/src/settings.json',
          'backend/src/modules/store/query.sql',
          'backend/src/view.tsx',
          'backend/migrations/0002-second.ts',
          'backend/tests/unit/__snapshots__/a.test.ts.snap',
          'backend/src/Makefile',
        ),
      ).toEqual([
        'A file of this kind does not belong in "migrations/".',
        'A file of this kind does not belong in "src/".',
        'A file of this kind does not belong in "src/".',
        'A file of this kind does not belong in "src/".',
        'A file of this kind does not belong in "src/".',
        'A file of this kind does not belong in "tests/".',
      ]);
    });

    it('should report a folder the workspace does not have', () => {
      expect(
        detailsOf('backend/scripts/seed.ts', 'frontend/tests/unit/a.test.tsx'),
      ).toEqual([
        'A workspace has no folder "scripts/".',
        'A workspace has no folder "tests/".',
      ]);
    });

    it('should leave a second package.json to the rule that owns it', () => {
      expect(
        detailsOf('backend/src/package.json', 'backend/scripts/package.json'),
      ).toEqual([]);
    });

    it('should not take a file named like a manifest for one', () => {
      expect(detailsOf('backend/src/my-package.json')).toEqual([
        'A file of this kind does not belong in "src/".',
      ]);
    });
  });

  describe('a file outside the workspaces', () => {
    it('should pass a file of any kind', () => {
      expect(
        detailsOf(
          'README.md',
          'vitest.config.ts',
          'docs/plan/picture.png',
          'harness/configs/knip.json',
          'backend-notes/a.sql',
        ),
      ).toEqual([]);
    });

    it('should pass a file named like a workspace', () => {
      expect(detailsOf('backend', 'frontend')).toEqual([]);
    });

    it('should pass a workspace the policy lists no files for', () => {
      const structure: Structure = {
        ...structureOf(),
        workspaces: new Map([['api-contracts', new Map()]]),
      };

      expect(detailsWith(structure, ['api-contracts/anything.txt'])).toEqual(
        [],
      );
    });
  });

  describe('a symbolic link', () => {
    it('should pass a link the policy lists, with its target', () => {
      expect(detailsWith(structureOf(), [], { [LINK]: TARGET })).toEqual([]);
    });

    it('should report a listed link that leads elsewhere', () => {
      expect(
        unknownFile(structureOf()).check(
          projectOfPaths([], { [LINK]: '../other/settings.json' }),
        ),
      ).toEqual([
        {
          rule: 'unknown-file',
          path: LINK,
          line: 1,
          detail:
            'A link to "../other/settings.json" is not in the list ' +
            'of links of the policy.',
        },
      ]);
    });

    it('should report a link the policy does not list', () => {
      expect(
        detailsWith(structureOf(), ['docs/a.md'], {
          'docs/settings.json': TARGET,
          'tools/readme': '../README.md',
        }),
      ).toEqual([
        `A link to "${TARGET}" is not in the list of links of the policy.`,
        'A link to "../README.md" is not in the list of links of the policy.',
      ]);
    });

    it('should report a link in a workspace once, as a link', () => {
      expect(
        detailsWith(structureOf(), [], {
          'backend/vitest.config.ts': '../harness/configs/vitest.ts',
          'backend/src/main.ts': '../../elsewhere.ts',
        }),
      ).toEqual([
        'A link to "../../elsewhere.ts" is not in the list ' +
          'of links of the policy.',
        'A link to "../harness/configs/vitest.ts" is not in the list ' +
          'of links of the policy.',
      ]);
    });

    it('should leave a link in an excluded place alone', () => {
      const structure: Structure = {
        ...structureOf(),
        excluded: ['harness/fixtures/'],
      };

      expect(
        detailsWith(structure, [], {
          'harness/fixtures/a/tools/config.json': '../x.ts',
          'harness/other/config.json': '../x.ts',
        }),
      ).toEqual([
        'A link to "../x.ts" is not in the list of links of the policy.',
      ]);
    });

    it('should judge a file in an excluded place that is no link', () => {
      const structure: Structure = {
        ...structureOf(),
        excluded: ['backend/'],
      };

      expect(detailsWith(structure, ['backend/vitest.config.ts'])).toEqual([
        NOT_AT_ROOT,
      ]);
    });
  });
});
