import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';

import { ChangeInstallModeHandler } from '#repositories/application/commands/change-install-mode/change-install-mode.handler';
import { RepositoryInstallModeController } from '#repositories/infrastructure/http/repository-install-mode.controller';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';

const PATH = `/repositories/${WIDGETS_ID.value}/install-mode`;

let world: RepositoriesWorld;
let service: HttpService;

async function change(body: unknown, path: string = PATH) {
  return service.send('POST', path, { body });
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  service = await startHttpService({
    controllers: [RepositoryInstallModeController],
    providers: [
      { provide: ChangeInstallModeHandler, useValue: world.changeInstallMode },
    ],
  });
});

afterEach(async () => {
  await service.close();
});

describe('RepositoryInstallModeController', () => {
  describe('POST /repositories/:id/install-mode', () => {
    it('should answer 200 with the repository installed by its own mode', async () => {
      await world.connected();

      const answer = await change({ mode: 'trusted' });

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body)).toMatchObject({
        id: WIDGETS_ID.value,
        install: { mode: 'trusted', isDefault: false },
      });
    });

    it('should answer 200 with the default once the mode is null', async () => {
      await world.connected();
      await change({ mode: 'trusted' });

      const answer = await change({ mode: null });

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body).install).toEqual({
        mode: 'sandboxed',
        isDefault: true,
      });
    });

    describe('when no repository has the id', () => {
      it.each([
        ['another id', PATH],
        ['a text that is no id', '/repositories/acme/install-mode'],
      ])('should answer 404 for %s', async (_case, path) => {
        const answer = await change({ mode: 'trusted' }, path);

        expect(answer).toEqual({
          status: 404,
          body: errorSchema.parse({
            error: 'not_found',
            message: 'No connected repository has this id.',
          }),
        });
      });
    });

    describe('when the body does not match its schema', () => {
      it.each([
        ['a mode that is not one', { mode: 'open' }],
        ['the word default', { mode: 'default' }],
        ['no mode', {}],
        ['another field', { mode: 'trusted', network: 'open' }],
      ])('should answer 400 for %s and keep nothing', async (_case, body) => {
        await world.connected();

        const answer = await change(body);

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        expect(world.repositories.saves).toEqual([]);
      });
    });
  });
});
