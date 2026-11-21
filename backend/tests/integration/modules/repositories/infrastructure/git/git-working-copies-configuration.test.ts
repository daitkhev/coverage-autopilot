import { readFileSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { GitWorkingCopies } from '#repositories/infrastructure/git/git-working-copies.adapter';
import { CONFIGURATION_PLACES, GitPlanter } from '#tests/support/git-planter';
import {
  COPY,
  WIDGETS,
  WorkingCopyFixture,
} from '#tests/support/working-copy-fixture';

const NEVER = new AbortController().signal;
const BRANCH = BranchName.create('coverage/src-a-ts');

let fixture: WorkingCopyFixture;
let planter: GitPlanter;
let copies: GitWorkingCopies;

beforeEach(() => {
  fixture = new WorkingCopyFixture();
  planter = new GitPlanter(fixture.host.folder);
});

afterEach(() => {
  fixture.remove();
});

describe('GitWorkingCopies', () => {
  describe.each(CONFIGURATION_PLACES)(
    'when $name defines drivers, hooks and a monitor',
    ({ place }) => {
      beforeEach(() => {
        copies = new GitWorkingCopies(
          planter.configuredIn(place, fixture.host.settings),
        );
      });

      it('should start none of them as it makes a copy of a repository that selects them', async () => {
        const commit = fixture.host.commit(WIDGETS, {
          '.gitattributes': planter.attributes(),
        });

        const tree = await copies.create(fixture.requestFor(commit), NEVER);

        expect(planter.ran()).toBe(false);
        expect(readFileSync(join(tree, 'src/a.ts'), 'utf8')).toBe(
          'export const a = 1;\n',
        );
      });

      it('should start none of them as it extracts a patch whose tree selects them', async () => {
        const tree = await copies.create(fixture.requestFor(), NEVER);
        writeFileSync(join(tree, '.gitattributes'), planter.attributes());
        writeFileSync(join(tree, 'src/a.ts'), 'export const a = 5;\n');

        const extracted = await copies.extractPatch(COPY);

        expect(planter.ran()).toBe(false);
        expect(
          extracted.outcome === 'extracted' &&
            extracted.patch.files.map((file) => file.value),
        ).toEqual(['.gitattributes', 'src/a.ts']);
      });

      it('should start none of them as it applies a patch to a tree that selects them', async () => {
        const text = await fixture.patchOf((source) => {
          writeFileSync(join(source, 'src/a.ts'), 'export const a = 6;\n');
        });
        const tree = await copies.create(fixture.requestFor(), NEVER);
        writeFileSync(join(tree, '.gitattributes'), planter.attributes());

        const applied = await copies.applyPatch(COPY, text);

        expect(planter.ran()).toBe(false);
        expect(applied).toMatchObject({ outcome: 'applied' });
      });

      it('should start none of them as it commits and pushes, and still push', async () => {
        // The remote stands for the host of the code: the hooks its own
        // side would run on receiving are the host's, not the service's.
        fixture.host.git(
          fixture.host.remoteOf(WIDGETS),
          'config',
          'core.hooksPath',
          devNull,
        );
        const tree = await copies.create(fixture.requestFor(), NEVER);
        writeFileSync(join(tree, '.gitattributes'), planter.attributes());
        writeFileSync(join(tree, 'src/a.test.ts'), 'test();\n');

        const pushed = await copies.commitAndPush(
          { id: COPY, url: fixture.url, branch: BRANCH, commitMessage: 'x' },
          NEVER,
        );

        expect(planter.ran()).toBe(false);
        expect(pushed).toEqual({ outcome: 'pushed' });
      });
    },
  );
});
