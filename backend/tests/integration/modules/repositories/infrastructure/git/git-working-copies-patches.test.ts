import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyMissingError } from '#repositories/infrastructure/errors/working-copy-missing.error';
import {
  COPY,
  WIDGETS,
  WorkingCopyFixture,
} from '#tests/support/working-copy-fixture';

const SOURCE = WorkingCopyId.fromPurpose('source');
const BRANCH = BranchName.create('coverage/src-a-ts');
const NEVER = new AbortController().signal;

let fixture: WorkingCopyFixture;

/** The patch of the changes a test makes in a copy of its own. */
async function patchOf(change: (path: string) => void): Promise<string> {
  change(await fixture.created(fixture.first, SOURCE));
  const extracted = await fixture.copies.extractPatch(SOURCE);
  return extracted.outcome === 'extracted' ? extracted.patch.text : '';
}

beforeEach(() => {
  fixture = new WorkingCopyFixture();
});

afterEach(() => {
  fixture.remove();
});

describe('GitWorkingCopies', () => {
  describe('applyPatch', () => {
    it('should apply the patch and name its files', async () => {
      const text = await patchOf((path) => {
        writeFileSync(join(path, 'src/a.test.ts'), 'test();\n');
      });
      const path = await fixture.created();

      const applied = await fixture.copies.applyPatch(COPY, text);

      expect(
        applied.outcome === 'applied' &&
          applied.files.map((file) => file.value),
      ).toEqual(['src/a.test.ts']);
      expect(readFileSync(join(path, 'src/a.test.ts'), 'utf8')).toBe(
        'test();\n',
      );
    });

    it('should name a removed file and a path with a tab', async () => {
      const text = await patchOf((path) => {
        rmSync(join(path, 'src/b.ts'));
        writeFileSync(join(path, 'src/a\tb.test.ts'), 'test();\n');
      });
      await fixture.created();

      const applied = await fixture.copies.applyPatch(COPY, text);

      expect(
        applied.outcome === 'applied' &&
          applied.files.map((file) => file.value),
      ).toEqual(['src/a\tb.test.ts', 'src/b.ts']);
    });

    describe('when the patch renames a file', () => {
      it('should answer refused and leave the copy unchanged', async () => {
        const path = await fixture.created();
        fixture.host.git(path, 'mv', 'src/b.ts', 'src/c.ts');
        const text = fixture.host.git(path, 'diff', '--cached', '-M', 'HEAD');
        fixture.host.git(path, 'reset', '--quiet', '--hard');

        const applied = await fixture.copies.applyPatch(COPY, `${text}\n`);

        expect(applied.outcome === 'refused' && applied.reason).toContain(
          'renames or copies a file',
        );
        expect(existsSync(join(path, 'src/b.ts'))).toBe(true);
      });
    });

    describe('when git would not apply all of it', () => {
      it('should answer refused with the reason and leave the copy unchanged', async () => {
        const text = await patchOf((path) => {
          writeFileSync(join(path, 'src/a.ts'), 'changed\n');
          writeFileSync(join(path, 'src/b.ts'), 'changed\n');
        });
        const path = await fixture.created();
        writeFileSync(join(path, 'src/b.ts'), 'moved on\n');

        const applied = await fixture.copies.applyPatch(COPY, text);

        expect(applied.outcome === 'refused' && applied.reason).toContain(
          'src/b.ts',
        );
        expect(readFileSync(join(path, 'src/a.ts'), 'utf8')).toBe(
          'export const a = 1;\n',
        );
      });

      it('should answer refused for a text that is no patch', async () => {
        await fixture.created();

        expect(
          await fixture.copies.applyPatch(COPY, 'not a patch'),
        ).toMatchObject({ outcome: 'refused' });
      });
    });

    describe('when the copy is gone', () => {
      it('should throw WorkingCopyMissingError', async () => {
        await expect(fixture.copies.applyPatch(COPY, '')).rejects.toThrow(
          WorkingCopyMissingError,
        );
      });
    });
  });

  describe('commitAndPush', () => {
    async function pushed(): Promise<unknown> {
      const path = await fixture.created();
      writeFileSync(join(path, 'src/a.test.ts'), 'test();\n');
      return fixture.copies.commitAndPush(
        {
          id: COPY,
          url: fixture.url,
          branch: BRANCH,
          commitMessage: 'test: cover a',
        },
        NEVER,
      );
    }

    it('should commit every change and push it as a new branch', async () => {
      expect(await pushed()).toEqual({ outcome: 'pushed' });
      expect(
        fixture.host.git(
          fixture.host.remoteOf(WIDGETS),
          'log',
          '-1',
          '--format=%s%n%P',
          BRANCH.ref,
        ),
      ).toBe(`test: cover a\n${fixture.first}`);
    });

    describe('when the host refuses the branch', () => {
      it('should answer refused with what git said', async () => {
        fixture.host.commit(
          WIDGETS,
          { 'x.txt': 'x\n' },
          {
            branch: BRANCH.value,
          },
        );

        expect(await pushed()).toEqual({
          outcome: 'refused',
          reason: expect.stringContaining('rejected') as unknown,
        });
      });
    });
  });
});
