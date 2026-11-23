import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';

import { ChangeThresholdHandler } from '#repositories/application/commands/change-threshold/change-threshold.handler';
import { RepositoryThresholdController } from '#repositories/infrastructure/http/repository-threshold.controller';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';

const PATH = `/repositories/${WIDGETS_ID.value}/threshold`;

let world: RepositoriesWorld;
let service: HttpService;

async function change(body: unknown, path: string = PATH) {
  return service.send('POST', path, { body });
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  service = await startHttpService({
    controllers: [RepositoryThresholdController],
    providers: [
      { provide: ChangeThresholdHandler, useValue: world.changeThreshold },
    ],
  });
});

afterEach(async () => {
  await service.close();
});

describe('RepositoryThresholdController', () => {
  describe('POST /repositories/:id/threshold', () => {
    it('should answer 200 with the repository judged by its own percent', async () => {
      await world.connected();

      const answer = await change({ percentage: 95 });

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body)).toMatchObject({
        id: WIDGETS_ID.value,
        threshold: { metric: 'lines', percentage: 95, isDefault: false },
      });
    });

    it('should answer 200 with the default once the percent is null', async () => {
      await world.connected();
      await change({ percentage: 95 });

      const answer = await change({ percentage: null });

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body).threshold).toEqual({
        metric: 'lines',
        percentage: 80,
        isDefault: true,
      });
    });

    describe('when no repository has the id', () => {
      it.each([
        ['another id', PATH],
        ['a text that is no id', '/repositories/acme/threshold'],
      ])('should answer 404 for %s', async (_case, path) => {
        const answer = await change({ percentage: 95 }, path);

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
        ['0', { percentage: 0 }],
        ['101', { percentage: 101 }],
        ['a part of a percent', { percentage: 85.5 }],
        ['a text', { percentage: '95' }],
        ['no percentage', {}],
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
