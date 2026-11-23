import { describe, expect, it } from 'vitest';

import { loadPatch, patchFilesOf } from '#screens/patch/patch-answer';
import {
  answered,
  fakeServiceApi,
  refused,
} from '#tests/support/fake-service-api';
import {
  IMPROVEMENT_BY_STATUS,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';
import { TWO_FILE_PATCH } from '#tests/support/sample-work-patch';

const WAITING = IMPROVEMENT_BY_STATUS.awaiting_approval;

const NOT_ACCEPTED = refused(409, {
  error: 'status_conflict',
  message: 'No attempt was accepted.',
});

describe('patchFilesOf', () => {
  it('should read the lines a new test file adds', () => {
    const [file] = patchFilesOf(PATCH_AWAITING_APPROVAL.patch);

    expect(file?.path).toBe('src/billing/sum.test.ts');
    expect(file?.created).toBe(true);
    expect(file?.added).toHaveLength(7);
    expect(file?.added[0]).toBe("import { sumTaxes } from './sum';");
    expect(file?.removed).toBe(0);
  });

  describe('when the patch changes more than one file', () => {
    it('should read each file apart, with what it takes out', () => {
      const files = patchFilesOf(TWO_FILE_PATCH.patch);

      expect(files.map((file) => file.path)).toEqual([
        'src/billing/sum.test.ts',
        'src/billing/fixtures.ts',
      ]);
      expect(files[1]).toEqual({
        path: 'src/billing/fixtures.ts',
        created: false,
        added: ['export const RATE = 0.2;'],
        removed: 1,
      });
    });
  });

  describe('when the text holds no file', () => {
    it('should read nothing', () => {
      expect(patchFilesOf('+a line before any file')).toEqual([]);
    });
  });

  describe('when a file names no new side', () => {
    it('should keep the names as they are written', () => {
      const [file] = patchFilesOf('diff --git one two\n+added');

      expect(file?.path).toBe('one two');
      expect(file?.added).toEqual(['added']);
    });
  });
});

describe('loadPatch', () => {
  it('should answer the improvement, its patch and its repository', async () => {
    const api = fakeServiceApi({
      getImprovement: () => Promise.resolve(answered(WAITING)),
      getImprovementPatch: () =>
        Promise.resolve(answered(PATCH_AWAITING_APPROVAL)),
      getRepository: () => Promise.resolve(answered(SCANNED_REPOSITORY)),
    });

    expect(await loadPatch(api, WAITING.id)).toEqual(
      answered({
        improvement: WAITING,
        patch: PATCH_AWAITING_APPROVAL,
        repository: SCANNED_REPOSITORY,
      }),
    );
  });

  describe('when the service refuses any of the three', () => {
    it('should answer the refusal', async () => {
      const improvement = () => Promise.resolve(answered(WAITING));
      const patch = () => Promise.resolve(answered(PATCH_AWAITING_APPROVAL));
      const refusing = () => Promise.resolve(NOT_ACCEPTED);
      const scripts = [
        { getImprovement: refusing },
        { getImprovement: improvement, getImprovementPatch: refusing },
        {
          getImprovement: improvement,
          getImprovementPatch: patch,
          getRepository: refusing,
        },
      ];

      for (const scripted of scripts) {
        const api = fakeServiceApi(scripted);
        expect(await loadPatch(api, WAITING.id)).toEqual(NOT_ACCEPTED);
      }
    });
  });
});
