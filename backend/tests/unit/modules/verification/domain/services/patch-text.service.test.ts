import { describe, expect, it } from 'vitest';

import { newFilePatch } from '#tests/support/verification-requests';
import { addedFilesOf } from '#verification/domain/services/patch-text.service';

function patchOf(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

/** A header and the extended lines of one file, with no text. */
function headerOf(path: string, ...extended: string[]): string[] {
  return [`diff --git a/${path} b/${path}`, ...extended];
}

function reasonOf(text: string): string {
  const added = addedFilesOf(text);
  return added.outcome === 'refused' ? added.reason : '';
}

describe('addedFilesOf', () => {
  it('should read the new files of a patch as git diff writes it', () => {
    const text = [
      newFilePatch('src/a.test.ts', [
        '+++ b/src/other.ts',
        'diff --git a/x b/x',
      ]),
      patchOf(...headerOf('src/empty.test.ts', 'new file mode 100644')),
      newFilePatch('src/c.test.ts', ['last']),
      '\\ No newline at end of file\n',
    ].join('');

    expect(addedFilesOf(text)).toEqual({
      outcome: 'read',
      paths: ['src/a.test.ts', 'src/empty.test.ts', 'src/c.test.ts'],
    });
  });

  it('should read a patch whose last line has no newline', () => {
    expect(addedFilesOf(newFilePatch().trimEnd())).toMatchObject({
      outcome: 'read',
    });
  });

  describe('when the patch adds nothing', () => {
    it('should refuse it', () => {
      expect(reasonOf('')).toBe('The patch adds no file.');
    });
  });

  describe('when a file is not a new plain file of text', () => {
    it('should refuse it with a sentence that names the file', () => {
      const cases: readonly [string[], string][] = [
        [headerOf('x.ts', 'deleted file mode 100644'), 'deletes x.ts'],
        [headerOf('x.ts', 'similarity index 90%'), 'renames or copies x.ts'],
        [
          headerOf('x.ts', 'old mode 100644', 'new mode 100755'),
          'mode of x.ts',
        ],
        [
          headerOf('x.ts', 'index 1a2b3c4..5d6e7f8 100644'),
          'changes x.ts, a file',
        ],
        [headerOf('x.ts', 'new file mode 120000'), 'x.ts as a symbolic link'],
        [headerOf('x.ts', 'new file mode 100755'), 'x.ts as an executable'],
        [
          headerOf('x.ts', 'new file mode 160000'),
          'x.ts, which is not a plain',
        ],
        [
          [...headerOf('x.ts', 'new file mode 100644'), 'GIT binary patch'],
          'x.ts as a binary file',
        ],
        [
          ['diff --git a/old.ts b/new.ts'],
          'renames or copies old.ts to new.ts',
        ],
      ];
      for (const [lines, words] of cases) {
        expect(reasonOf(patchOf(...lines))).toContain(words);
      }
    });
  });

  describe('when the header of a file is odd', () => {
    it('should refuse it', () => {
      const twice = headerOf(
        'x.ts',
        'new file mode 100644',
        'new file mode 100644',
      );
      const oddIndex = headerOf(
        'x.ts',
        'new file mode 100644',
        'index 0000000..zz',
      );

      expect(reasonOf(patchOf(...twice))).toContain(
        'in a way git does not write',
      );
      expect(reasonOf(patchOf(...oddIndex))).toContain(
        'in a way git does not write',
      );
      expect(reasonOf(patchOf('diff --git x.ts'))).toBe(
        'Line 1 of the patch is not the header of a file as git writes one.',
      );
    });
  });

  describe('when a line belongs to no new file', () => {
    it('should refuse a section git would read without a header', () => {
      const text = [
        newFilePatch(),
        patchOf(
          '--- a/src/used.ts',
          '+++ b/src/used.ts',
          '@@ -1 +1 @@',
          '-a',
          '+b',
        ),
      ].join('');

      expect(reasonOf(text)).toBe(
        'Line 9 of the patch is not the header of a file as git writes one.',
      );
    });

    it('should refuse text before the first file', () => {
      expect(reasonOf(`From: someone\n${newFilePatch()}`)).toContain('Line 1');
    });
  });

  describe('when the text of a new file does not add lines', () => {
    it('should refuse it', () => {
      const header = headerOf('x.ts', 'new file mode 100644');
      const cases = [
        patchOf(...header, '--- a/x.ts', '+++ b/x.ts', '@@ -0,0 +1 @@', '+a'),
        patchOf(
          ...header,
          '--- /dev/null',
          '+++ b/y.ts',
          '@@ -0,0 +1 @@',
          '+a',
        ),
        patchOf(...header, '--- /dev/null', '+++ b/x.ts', '@@ -1 +1 @@', '+a'),
        patchOf(
          ...header,
          '--- /dev/null',
          '+++ b/x.ts',
          '@@ -0,0 +1,2 @@',
          '+a',
        ),
        patchOf(
          ...header,
          '--- /dev/null',
          '+++ b/x.ts',
          '@@ -0,0 +1,2 @@',
          '+a',
          '-b',
        ),
        patchOf(...header, '--- /dev/null'),
      ];
      for (const text of cases) {
        expect(reasonOf(text)).toBe(
          'The patch holds a line in x.ts that does not add text.',
        );
      }
    });
  });
});
