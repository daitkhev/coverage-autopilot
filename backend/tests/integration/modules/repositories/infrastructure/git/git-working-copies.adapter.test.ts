import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { CommitNotFoundError } from '#repositories/infrastructure/errors/commit-not-found.error';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolStoppedError } from '#repositories/infrastructure/errors/tool-stopped.error';
import { WorkingCopyMissingError } from '#repositories/infrastructure/errors/working-copy-missing.error';
import { GitWorkingCopies } from '#repositories/infrastructure/git/git-working-copies.adapter';
import {
  COPY,
  WIDGETS,
  WorkingCopyFixture,
} from '#tests/support/working-copy-fixture';

const NEVER = new AbortController().signal;

let fixture: WorkingCopyFixture;

beforeEach(() => {
  fixture = new WorkingCopyFixture();
});

afterEach(() => {
  fixture.remove();
});

describe('GitWorkingCopies', () => {
  describe('create', () => {
    it('should make a clean clone at the commit in the folder of its id', async () => {
      fixture.host.commit(WIDGETS, { 'src/a.ts': 'export const a = 3;\n' });

      const path = await fixture.created();

      expect(path).toBe(fixture.pathOf());
      expect(fixture.host.git(path, 'rev-parse', 'HEAD')).toBe(fixture.first);
      expect(fixture.host.git(path, 'status', '--porcelain')).toBe('');
      expect(readFileSync(join(path, 'src/a.ts'), 'utf8')).toBe(
        'export const a = 1;\n',
      );
    });

    it('should give two purposes two folders', async () => {
      const one = await fixture.created();
      const other = await fixture.created(
        fixture.first,
        WorkingCopyId.fromPurpose('scan:2'),
      );

      expect(one).not.toBe(other);
      expect(existsSync(one) && existsSync(other)).toBe(true);
    });

    it('should make the copy anew in place of what an earlier try left', async () => {
      const path = await fixture.created();
      writeFileSync(join(path, 'left-over.txt'), 'x');

      await fixture.created();

      expect(existsSync(join(path, 'left-over.txt'))).toBe(false);
    });

    it('should keep objects of its own, with no link to the mirror', async () => {
      const path = await fixture.created();

      expect(existsSync(join(path, '.git/objects/info/alternates'))).toBe(
        false,
      );
    });

    it('should bring a commit that is only on another branch', async () => {
      await fixture.created();
      const side = fixture.host.commit(
        WIDGETS,
        { 'src/c.ts': 'export const c = 3;\n' },
        { parent: fixture.first, branch: 'side' },
      );

      const path = await fixture.created(side);

      expect(fixture.host.git(path, 'rev-parse', 'HEAD')).toBe(side);
    });

    describe('when the host does not have the commit', () => {
      it('should throw CommitNotFoundError and leave no folder', async () => {
        await expect(fixture.created('c'.repeat(40))).rejects.toThrow(
          CommitNotFoundError,
        );
        expect(existsSync(fixture.pathOf())).toBe(false);
      });
    });

    describe('when the host has no such repository', () => {
      it('should throw ToolFailedError', async () => {
        rmSync(fixture.host.remoteOf(WIDGETS), { recursive: true });

        await expect(fixture.created()).rejects.toThrow(ToolFailedError);
      });
    });

    describe('when the checkout after the clone fails', () => {
      it('should remove what it made and throw', async () => {
        const refusingCheckout = [
          'const [command, ...rest] = process.argv.slice(1);',
          'if (command === "checkout") { process.exit(1); }',
          'const run = require("node:child_process").spawnSync(',
          '  "git", [command, ...rest], { stdio: "inherit" });',
          'process.exit(run.status);',
        ].join('\n');
        const settings = fixture.host.settings;
        const copies = new GitWorkingCopies({
          ...settings,
          git: {
            ...settings.git,
            command: [process.execPath, '--eval', refusingCheckout, '--'],
          },
        });

        await expect(
          copies.create(fixture.requestFor(), NEVER),
        ).rejects.toThrow(ToolFailedError);
        expect(existsSync(fixture.pathOf())).toBe(false);
      });
    });

    describe('when the signal of the caller has aborted', () => {
      it('should throw ToolStoppedError', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
          fixture.copies.create(fixture.requestFor(), controller.signal),
        ).rejects.toThrow(ToolStoppedError);
      });
    });
  });

  describe('dispose', () => {
    it('should remove the folder of the copy', async () => {
      const path = await fixture.created();

      await fixture.copies.dispose(COPY);

      expect(existsSync(path)).toBe(false);
    });

    it('should not fail for a copy that is gone', async () => {
      await expect(fixture.copies.dispose(COPY)).resolves.toBeUndefined();
    });
  });

  describe('extractPatch', () => {
    it('should answer empty for a copy as its commit left it', async () => {
      await fixture.created();

      expect(await fixture.copies.extractPatch(COPY)).toEqual({
        outcome: 'empty',
      });
    });

    it('should give the changes, the new files and the removed ones', async () => {
      const path = await fixture.created();
      writeFileSync(join(path, 'src/a.ts'), 'export const a = 4;\n');
      writeFileSync(join(path, 'src/a.test.ts'), 'test("a", () => {});\n');
      rmSync(join(path, 'src/b.ts'));

      const extracted = await fixture.copies.extractPatch(COPY);

      const patch = extracted.outcome === 'extracted' ? extracted.patch : null;
      expect(patch?.files.map((file) => file.value)).toEqual([
        'src/a.test.ts',
        'src/a.ts',
        'src/b.ts',
      ]);
      expect(patch?.text).toContain('+export const a = 4;');
      expect(patch?.text).toContain('new file mode');
      expect(patch?.hash).toBe(
        createHash('sha256')
          .update(patch?.text ?? '')
          .digest('hex'),
      );
    });

    it('should leave out a file the repository ignores', async () => {
      const path = await fixture.created();
      writeFileSync(join(path, 'src/a.test.ts'), 'test("a", () => {});\n');
      mkdirSync(join(path, 'coverage'));
      writeFileSync(join(path, 'coverage/report.json'), '{}');

      const extracted = await fixture.copies.extractPatch(COPY);

      expect(
        extracted.outcome === 'extracted' &&
          extracted.patch.files.map((file) => file.value),
      ).toEqual(['src/a.test.ts']);
    });

    describe('when the copy is gone', () => {
      it('should throw WorkingCopyMissingError', async () => {
        await expect(fixture.copies.extractPatch(COPY)).rejects.toThrow(
          WorkingCopyMissingError,
        );
      });
    });
  });
});
