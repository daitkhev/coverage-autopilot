import { beforeEach, describe, expect, it } from 'vitest';

import type { ImprovementListDto } from '#improvement/application/dto/improvement.dto';
import { InvalidFilePathError } from '#kernel/errors/invalid-file-path.error';
import { InvalidRepositoryIdError } from '#kernel/errors/invalid-repository-id.error';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import {
  hashOf,
  IMPROVEMENT_ID,
  REPOSITORY_ID,
} from '#tests/support/improvement-values';

const TAX_ID = '00000000-0000-4000-8000-000000000201';
const ELSEWHERE_ID = '00000000-0000-4000-8000-000000000202';
const OTHER_REPOSITORY_ID = '00000000-0000-4000-8000-000000000203';
const TAX_FILE = 'src/tax.ts';

let world: ImprovementRequestWorld;

const idsOf = (shown: ImprovementListDto) => shown.items.map(({ id }) => id);

/**
 * Three improvements made at the same moment, so the store lists the
 * greatest id first: one of another repository that failed, one of
 * another file being analyzed, and the target that was completed.
 */
beforeEach(async () => {
  world = new ImprovementRequestWorld();
  await world.stored(
    improvementIn('completed'),
    improvementIn('analyzing', {
      id: TAX_ID,
      key: 'request-2',
      fingerprint: hashOf('e'),
      targetFile: TAX_FILE,
    }),
    improvementIn('failed', {
      id: ELSEWHERE_ID,
      key: 'request-3',
      fingerprint: hashOf('d'),
      repositoryId: OTHER_REPOSITORY_ID,
    }),
  );
});

describe('ListImprovementsHandler', () => {
  describe('execute', () => {
    it('should list every improvement, the newest first, as the store gives them', async () => {
      const shown = await world.listImprovements.execute({});

      expect(idsOf(shown)).toEqual([ELSEWHERE_ID, TAX_ID, IMPROVEMENT_ID]);
    });

    it('should show each with what its job adds', async () => {
      const shown = await world.listImprovements.execute({});

      expect(shown.items.map(({ waitingFor }) => waitingFor)).toEqual([
        null,
        'worker',
        null,
      ]);
    });

    it.each([
      ['repository', { repositoryId: REPOSITORY_ID }, [TAX_ID, IMPROVEMENT_ID]],
      ['status', { status: 'completed' }, [IMPROVEMENT_ID]],
      ['file', { filePath: TAX_FILE }, [TAX_ID]],
      [
        'repository and status',
        { repositoryId: OTHER_REPOSITORY_ID, status: 'completed' },
        [],
      ],
    ] as const)('should narrow the list by %s', async (_by, query, ids) => {
      expect(idsOf(await world.listImprovements.execute(query))).toEqual(ids);
    });

    describe('when a value of the filter breaks a rule', () => {
      it.each([
        ['a repository id', { repositoryId: 'acme' }, InvalidRepositoryIdError],
        ['a path', { filePath: 'src//tax.ts' }, InvalidFilePathError],
      ] as const)(
        'should throw the error of %s',
        async (_value, query, error) => {
          await expect(world.listImprovements.execute(query)).rejects.toThrow(
            error,
          );
        },
      );
    });
  });
});
