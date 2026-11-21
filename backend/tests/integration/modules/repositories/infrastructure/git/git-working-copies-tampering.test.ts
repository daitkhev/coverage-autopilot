import {
  appendFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { WorkingCopyTamperedError } from '#repositories/infrastructure/errors/working-copy-tampered.error';
import { GitPlanter } from '#tests/support/git-planter';
import {
  COPY,
  WIDGETS,
  WorkingCopyFixture,
} from '#tests/support/working-copy-fixture';

const NEVER = new AbortController().signal;
const BRANCH = BranchName.create('coverage/src-a-ts');

interface Tampering {
  readonly name: string;
  /** What code in a sandbox does to the tree of the copy it was lent. */
  readonly tamper: (tree: string, planter: GitPlanter) => void;
}

/** Each way the tree could make the git of the host start a program. */
const TAMPERINGS: readonly Tampering[] = [
  {
    name: 'a .git/config in the tree names a core.fsmonitor',
    tamper: (tree, planter) => {
      mkdirSync(join(tree, '.git'), { recursive: true });
      appendFileSync(join(tree, '.git/config'), planter.monitorConfig());
    },
  },
  {
    name: 'a .git/config in the tree defines a filter that .gitattributes selects',
    tamper: (tree, planter) => {
      mkdirSync(join(tree, '.git'), { recursive: true });
      appendFileSync(join(tree, '.git/config'), planter.driverConfig());
      writeFileSync(join(tree, '.gitattributes'), planter.attributes());
    },
  },
  {
    name: 'the .git of the tree was replaced by a folder with its own config and hooks',
    tamper: (tree, planter) => {
      rmSync(join(tree, '.git'), { recursive: true, force: true });
      planter.gitDirectoryAt(join(tree, '.git'));
      writeFileSync(join(tree, '.gitattributes'), planter.attributes());
    },
  },
  {
    name: 'a .git file in the tree points at a git directory of its choice',
    tamper: (tree, planter) => {
      rmSync(join(tree, '.git'), { recursive: true, force: true });
      planter.gitDirectoryAt(join(tree, '.planted'));
      writeFileSync(join(tree, '.git'), 'gitdir: .planted\n');
      writeFileSync(join(tree, '.gitattributes'), planter.attributes());
    },
  },
  {
    name: 'a folder of the tree holds a repository of its own',
    tamper: (tree, planter) => {
      planter.gitDirectoryAt(join(tree, 'src/vendor/.GIT'));
    },
  },
];

let fixture: WorkingCopyFixture;
let planter: GitPlanter;

/** What the work threw, or null when it did not throw. */
async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return null;
  } catch (error) {
    return error;
  }
}

/** The copy as a sandbox leaves it: a test file added, then tampered. */
async function tampered(tamper: Tampering['tamper']): Promise<string> {
  const tree = await fixture.created();
  writeFileSync(join(tree, 'src/a.ts'), 'export const a = 5;\n');
  tamper(tree, planter);
  return tree;
}

beforeEach(() => {
  fixture = new WorkingCopyFixture();
  planter = new GitPlanter(fixture.host.folder);
});

afterEach(() => {
  fixture.remove();
});

describe('GitWorkingCopies', () => {
  describe('create', () => {
    it('should keep the git directory out of the tree and leave no .git in it', async () => {
      const tree = await fixture.created();

      expect(existsSync(join(tree, '.git'))).toBe(false);
      expect(existsSync(join(fixture.gitDirOf(), 'HEAD'))).toBe(true);
      expect(fixture.gitIn(COPY, 'rev-parse', 'HEAD')).toBe(fixture.first);
    });
  });

  describe.each(TAMPERINGS)('when $name', ({ tamper }) => {
    it('should refuse extractPatch with WorkingCopyTamperedError and start nothing', async () => {
      await tampered(tamper);

      const failure = await failureOf(fixture.copies.extractPatch(COPY));

      expect(planter.ran()).toBe(false);
      expect(failure).toBeInstanceOf(WorkingCopyTamperedError);
    });

    it('should refuse applyPatch with WorkingCopyTamperedError and start nothing', async () => {
      const text = await fixture.patchOf((tree) => {
        writeFileSync(join(tree, 'src/a.ts'), 'export const a = 6;\n');
      });
      await tampered(tamper);

      const failure = await failureOf(fixture.copies.applyPatch(COPY, text));

      expect(planter.ran()).toBe(false);
      expect(failure).toBeInstanceOf(WorkingCopyTamperedError);
    });

    it('should refuse commitAndPush with WorkingCopyTamperedError and push nothing', async () => {
      await tampered(tamper);

      const failure = await failureOf(
        fixture.copies.commitAndPush(
          { id: COPY, url: fixture.url, branch: BRANCH, commitMessage: 'x' },
          NEVER,
        ),
      );

      expect(planter.ran()).toBe(false);
      expect(failure).toBeInstanceOf(WorkingCopyTamperedError);
      expect(
        fixture.host.git(
          fixture.host.remoteOf(WIDGETS),
          'for-each-ref',
          BRANCH.ref,
        ),
      ).toBe('');
    });
  });

  describe('when the tree links to a folder outside it that holds a repository', () => {
    it('should not follow the link and extract the patch', async () => {
      const tree = await fixture.created();
      mkdirSync(join(tree, 'src/deep'));
      symlinkSync(
        join(fixture.host.folder, 'seeds'),
        join(tree, 'src/deep/out'),
      );

      const extracted = await fixture.copies.extractPatch(COPY);

      expect(extracted.outcome).toBe('extracted');
    });
  });

  describe('when a name in the tree is .git with a code point a file system may ignore', () => {
    it('should refuse extractPatch with WorkingCopyTamperedError', async () => {
      const tree = await fixture.created();
      writeFileSync(join(tree, 'src/.g‌it'), 'gitdir: .planted\n');

      await expect(fixture.copies.extractPatch(COPY)).rejects.toThrow(
        WorkingCopyTamperedError,
      );
    });
  });

  describe('dispose', () => {
    it('should remove the tree and the git directory', async () => {
      await fixture.created();

      await fixture.copies.dispose(COPY);

      expect(existsSync(fixture.pathOf())).toBe(false);
      expect(existsSync(fixture.gitDirOf())).toBe(false);
    });
  });
});
