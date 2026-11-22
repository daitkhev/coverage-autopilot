import { beforeEach, describe, expect, it } from 'vitest';

import { MissingRepositoryError } from '#coverage/application/errors/missing-repository.error';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { REPOSITORY_ID } from '#tests/support/coverage-snapshots';
import {
  judgeBy,
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

const WIDGETS_ID = RepositoryId.create(REPOSITORY_ID);

let repositories: StandInRepositories;
let thresholds: RepositoryThresholds;

beforeEach(() => {
  repositories = standInRepositories();
  thresholds = new RepositoryThresholds(repositories);
});

describe('RepositoryThresholds', () => {
  describe('of', () => {
    it('should give the threshold the repository is judged by', async () => {
      const threshold = await thresholds.of(WIDGETS_ID);

      expect(threshold.metric).toBe('lines');
      expect(threshold.percentage.value).toBe(80);
    });

    it('should ask anew each time, so a change counts at once', async () => {
      await thresholds.of(WIDGETS_ID);
      judgeBy(repositories, 95);

      const threshold = await thresholds.of(WIDGETS_ID);

      expect(threshold.percentage.value).toBe(95);
    });

    describe('when no connected repository has the id', () => {
      it('should throw a fault that is not retried', async () => {
        repositories.repository = null;

        const asked = thresholds.of(WIDGETS_ID);

        await expect(asked).rejects.toThrow(MissingRepositoryError);
        await expect(asked).rejects.toMatchObject({
          code: 'missing_repository',
          retryable: false,
          message: `No connected repository has the id ${REPOSITORY_ID}, which a snapshot names.`,
        });
      });
    });
  });
});
