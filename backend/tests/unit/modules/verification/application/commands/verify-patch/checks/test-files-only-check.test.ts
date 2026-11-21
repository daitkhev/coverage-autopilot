import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import {
  NEW_TEST_FILE,
  newFilePatch,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { patchingRepositories } from '#tests/support/verification-stand-ins';
import { TestFilesOnlyCheck } from '#verification/application/commands/verify-patch/checks/test-files-only-check';

const NEW_FILE = FilePath.create(NEW_TEST_FILE);

describe('TestFilesOnlyCheck', () => {
  describe('read', () => {
    it('should give the test files the text adds', () => {
      const check = new TestFilesOnlyCheck(patchingRepositories());

      expect(check.read(verifyRequestOf())).toEqual({
        outcome: 'test_files',
        files: [NEW_FILE],
      });
    });

    describe('when the text adds a file that is not a test', () => {
      it('should fail the check with the sentence of the text', () => {
        const check = new TestFilesOnlyCheck(patchingRepositories());

        const reading = check.read(
          verifyRequestOf({
            patch: { text: newFilePatch('src/used.ts'), hash: 'hash' },
          }),
        );

        expect(
          reading.outcome === 'refused' && reading.result.message,
        ).toContain('src/used.ts, whose name does not end like a test file');
      });
    });
  });

  describe('apply', () => {
    const application = {
      workingCopyId: 'copy-1',
      patchText: newFilePatch(),
      files: [NEW_FILE],
    };

    it('should pass when git wrote exactly the files of the text', async () => {
      const repositories = patchingRepositories();

      const result = await new TestFilesOnlyCheck(repositories).apply(
        application,
      );

      expect(result.status).toBe('passed');
      expect(repositories.patches).toEqual([
        { workingCopyId: 'copy-1', patchText: newFilePatch() },
      ]);
    });

    describe('when git refuses the patch', () => {
      it('should fail with what git said', async () => {
        const repositories = patchingRepositories();
        repositories.application = {
          outcome: 'refused',
          reason: 'error: src/used.test.ts: already exists\n',
        };

        const result = await new TestFilesOnlyCheck(repositories).apply(
          application,
        );

        expect(result.message).toBe(
          'git did not apply the patch: error: src/used.test.ts: already exists',
        );
      });
    });

    describe('when git wrote another file', () => {
      it('should fail and name it', async () => {
        const repositories = patchingRepositories();
        repositories.application = {
          outcome: 'applied',
          files: [NEW_FILE, FilePath.create('package.json')],
        };

        const result = await new TestFilesOnlyCheck(repositories).apply(
          application,
        );

        expect(result.message).toContain('git wrote package.json');
      });
    });
  });
});
