import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidThresholdPercentageError } from '#repositories/domain/errors/invalid-threshold-percentage.error';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCAN_ID } from '#tests/support/scan-jobs';
import { latestSnapshot } from '#tests/support/stand-in-repository-coverage';

let world: RepositoriesWorld;

beforeEach(() => {
  world = new RepositoriesWorld();
});

async function changeTo(percentage: number | null) {
  return world.changeThreshold.execute({
    repositoryId: WIDGETS_ID.value,
    percentage,
  });
}

describe('ChangeThresholdHandler', () => {
  describe('execute', () => {
    it('should keep a percent of its own in one transaction', async () => {
      await world.connected();

      await changeTo(95);

      const [save, ...others] = world.repositories.saves;
      expect(save?.repository.threshold?.value).toBe(95);
      expect(save?.transaction).toBe(world.transactions.transaction);
      expect(others).toEqual([]);
      expect(world.transactions.runs).toBe(1);
    });

    it('should give the repository as it is judged now, with its coverage', async () => {
      await world.connected();
      world.coverage.answer = {
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      };

      const view = await changeTo(95);

      expect(view).toMatchObject({
        id: WIDGETS_ID,
        threshold: { metric: 'lines', percentage: 95, isDefault: false },
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      });
      expect(world.coverage.asked).toEqual([WIDGETS_ID]);
    });

    describe('with no percentage', () => {
      it('should give the repository the default of the service back', async () => {
        const repository = await world.connected();
        repository.changeThreshold(ThresholdPercentage.create(95));

        const view = await changeTo(null);

        expect(world.repositories.saves[0]?.repository.threshold).toBeNull();
        expect(view?.threshold).toEqual({
          metric: 'lines',
          percentage: 80,
          isDefault: true,
        });
      });
    });

    it('should refuse a percent that is no threshold and keep nothing', async () => {
      await world.connected();

      await expect(changeTo(0)).rejects.toThrow(
        InvalidThresholdPercentageError,
      );
      expect(world.repositories.saves).toEqual([]);
    });

    it.each([
      ['an id no repository has', '00000000-0000-4000-8000-0000000000ff'],
      ['a text that is no id', 'acme-widgets'],
    ])('should answer %s with null and keep nothing', async (_case, id) => {
      await world.connected();

      const view = await world.changeThreshold.execute({
        repositoryId: id,
        percentage: 95,
      });

      expect(view).toBeNull();
      expect(world.repositories.saves).toEqual([]);
      expect(world.coverage.asked).toEqual([]);
    });
  });
});
