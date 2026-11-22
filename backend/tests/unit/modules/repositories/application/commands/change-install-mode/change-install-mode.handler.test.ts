import { beforeEach, describe, expect, it } from 'vitest';

import type { InstallMode } from '#repositories/domain/value-objects/install-mode.vo';
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

async function changeTo(mode: InstallMode | null) {
  return world.changeInstallMode.execute({
    repositoryId: WIDGETS_ID.value,
    mode,
  });
}

describe('ChangeInstallModeHandler', () => {
  describe('execute', () => {
    it('should keep a mode of its own in one transaction', async () => {
      await world.connected();

      await changeTo('trusted');

      const [save, ...others] = world.repositories.saves;
      expect(save?.repository.installMode).toBe('trusted');
      expect(save?.transaction).toBe(world.transactions.transaction);
      expect(others).toEqual([]);
      expect(world.transactions.runs).toBe(1);
    });

    it('should give the repository as it is installed now, with its coverage', async () => {
      await world.connected();
      world.coverage.answer = {
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      };

      const view = await changeTo('trusted');

      expect(view).toMatchObject({
        id: WIDGETS_ID,
        install: { mode: 'trusted', isDefault: false },
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      });
      expect(world.coverage.asked).toEqual([WIDGETS_ID]);
    });

    it('should keep the mode of the default as a choice of its own', async () => {
      await world.connected();

      const view = await changeTo('sandboxed');

      expect(world.repositories.saves[0]?.repository.installMode).toBe(
        'sandboxed',
      );
      expect(view?.install).toEqual({ mode: 'sandboxed', isDefault: false });
    });

    describe('with no mode', () => {
      it('should give the repository the default of the service back', async () => {
        const repository = await world.connected();
        repository.changeInstallMode('trusted');

        const view = await changeTo(null);

        expect(world.repositories.saves[0]?.repository.installMode).toBeNull();
        expect(view?.install).toEqual({ mode: 'sandboxed', isDefault: true });
      });
    });

    it.each([
      ['an id no repository has', '00000000-0000-4000-8000-0000000000ff'],
      ['a text that is no id', 'acme-widgets'],
    ])('should answer %s with null and keep nothing', async (_case, id) => {
      await world.connected();

      const view = await world.changeInstallMode.execute({
        repositoryId: id,
        mode: 'trusted',
      });

      expect(view).toBeNull();
      expect(world.repositories.saves).toEqual([]);
      expect(world.coverage.asked).toEqual([]);
    });
  });
});
