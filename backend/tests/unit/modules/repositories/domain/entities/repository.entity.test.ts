import { describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import { Repository } from '#repositories/domain/entities/repository.entity';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';

const ID = RepositoryId.create('00000000-0000-4000-8000-000000000001');
const URL_OF_WIDGETS = RepositoryUrl.parse('https://github.com/acme/widgets');
const MAIN = BranchName.create('main');
const CONNECTED_AT = Instant.parse('2026-01-02T03:04:05.006Z');
const FIRST = CommitSha.create('a'.repeat(40));
const SECOND = CommitSha.create('b'.repeat(40));
const NINETY_FIVE = ThresholdPercentage.create(95);

function connected(): Repository {
  return Repository.connect(ID, {
    url: URL_OF_WIDGETS,
    defaultBranch: MAIN,
    connectedAt: CONNECTED_AT,
  });
}

describe('Repository', () => {
  describe('connect', () => {
    it('should keep the address, the branch and the moment of connection', () => {
      const repository = connected();

      expect(repository.id).toBe(ID);
      expect(repository.url).toBe(URL_OF_WIDGETS);
      expect(repository.defaultBranch).toBe(MAIN);
      expect(repository.connectedAt).toBe(CONNECTED_AT);
    });

    it('should know no head yet', () => {
      expect(connected().head).toBeNull();
    });

    it('should leave its files to the default threshold', () => {
      expect(connected().threshold).toBeNull();
    });
  });

  describe('restore', () => {
    it('should keep the head and the threshold it was saved with', () => {
      const head = { commit: FIRST, readAt: CONNECTED_AT };

      const repository = Repository.restore(ID, {
        url: URL_OF_WIDGETS,
        defaultBranch: MAIN,
        connectedAt: CONNECTED_AT,
        head,
        threshold: NINETY_FIVE,
      });

      expect(repository.head).toBe(head);
      expect(repository.threshold).toBe(NINETY_FIVE);
    });
  });

  describe('changeThreshold', () => {
    it('should keep a threshold of its own', () => {
      const repository = connected();

      repository.changeThreshold(NINETY_FIVE);

      expect(repository.threshold).toBe(NINETY_FIVE);
    });

    it('should give its files back to the default when it is cleared', () => {
      const repository = connected();
      repository.changeThreshold(NINETY_FIVE);

      repository.changeThreshold(null);

      expect(repository.threshold).toBeNull();
    });

    it('should keep the head it read', () => {
      const repository = connected();
      const head = { commit: FIRST, readAt: CONNECTED_AT };
      repository.recordHead(head);

      repository.changeThreshold(NINETY_FIVE);

      expect(repository.head).toBe(head);
    });
  });

  describe('recordHead', () => {
    it('should keep the head and the moment it was read', () => {
      const repository = connected();
      const head = { commit: FIRST, readAt: CONNECTED_AT };

      repository.recordHead(head);

      expect(repository.head).toBe(head);
    });

    it('should keep the threshold it has', () => {
      const repository = connected();
      repository.changeThreshold(NINETY_FIVE);

      repository.recordHead({ commit: FIRST, readAt: CONNECTED_AT });

      expect(repository.threshold).toBe(NINETY_FIVE);
    });

    it('should keep a newer reading in place of an older one', () => {
      const repository = connected();
      const newer = {
        commit: SECOND,
        readAt: CONNECTED_AT.plusMilliseconds(1),
      };

      repository.recordHead({ commit: FIRST, readAt: CONNECTED_AT });
      repository.recordHead(newer);

      expect(repository.head).toBe(newer);
    });

    describe('when the reading is older than the one kept', () => {
      it('should change nothing', () => {
        const repository = connected();
        const newer = {
          commit: SECOND,
          readAt: CONNECTED_AT.plusMilliseconds(1),
        };

        repository.recordHead(newer);
        repository.recordHead({ commit: FIRST, readAt: CONNECTED_AT });

        expect(repository.head).toBe(newer);
      });
    });
  });
});
