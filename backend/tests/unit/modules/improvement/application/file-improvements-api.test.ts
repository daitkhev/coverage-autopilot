import { beforeEach, describe, expect, it } from 'vitest';

import { FILE_IMPROVEMENTS } from '#coverage/application/contracts/file-improvements';
import { FileImprovementsApi } from '#improvement/application/file-improvements-api';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import {
  hashOf,
  IMPROVEMENT_ID,
  REPOSITORY_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';

/** A second improvement of the target, asked for after the first. */
const NEWER = {
  id: '00000000-0000-4000-8000-000000000202',
  key: 'request-2',
  fingerprint: hashOf('2'),
};

const WIDGETS = RepositoryId.create(REPOSITORY_ID);

let world: ImprovementRequestWorld;
let api: FileImprovementsApi;

beforeEach(() => {
  world = new ImprovementRequestWorld();
  api = new FileImprovementsApi(world.improvements);
});

describe('FileImprovementsApi', () => {
  it('should be bound by the token the coverage module injects', () => {
    expect(FileImprovementsApi.token).toBe(FILE_IMPROVEMENTS);
  });

  describe('latestOf', () => {
    it('should give each file of the repository with its improvement', async () => {
      await world.stored(improvementIn('completed'));

      expect(await api.latestOf(WIDGETS)).toEqual([
        {
          path: FilePath.create(TARGET_FILE),
          latest: { id: IMPROVEMENT_ID, status: 'completed' },
        },
      ]);
    });

    it('should give the newest improvement of the file', async () => {
      await world.stored(
        improvementIn('failed'),
        improvementIn('generating', NEWER),
      );

      const latest = await api.latestOf(WIDGETS);

      expect(latest.map((each) => each.latest)).toEqual([
        { id: NEWER.id, status: 'generating' },
      ]);
    });

    it('should give nothing for a repository nobody asked to improve', async () => {
      expect(await api.latestOf(WIDGETS)).toEqual([]);
    });

    it('should not take the work on a file of the same path in another repository', async () => {
      await world.stored(
        improvementIn('completed', {
          repositoryId: '00000000-0000-4000-8000-000000000201',
        }),
      );

      expect(await api.latestOf(WIDGETS)).toEqual([]);
    });
  });
});
