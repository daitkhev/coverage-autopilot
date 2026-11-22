import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  repositoryListSchema,
  repositorySchema,
} from '@coverage-autopilot/api-contracts/repositories';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import { GetRepositoryViewHandler } from '#repositories/application/queries/get-repository-view/get-repository-view.handler';
import { ListRepositoriesHandler } from '#repositories/application/queries/list-repositories/list-repositories.handler';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { RepositoriesController } from '#repositories/infrastructure/http/repositories.controller';
import {
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCAN_ID } from '#tests/support/scan-jobs';
import { STORED_TIME } from '#tests/support/schema-rows';
import { latestSnapshot } from '#tests/support/stand-in-repository-coverage';

const WIDGETS = `/repositories/${WIDGETS_ID.value}`;

const URL = 'https://github.com/acme/widgets';

/** The id the first repository connected in a test is given. */
const FIRST_ID = '00000000-0000-4000-8000-000000000001';

const MOVED_HEAD = 'd'.repeat(SNAPSHOT_COMMIT.length);

const NO_REPOSITORY = errorSchema.parse({
  error: 'not_found',
  message: 'No connected repository has this id.',
});

let world: RepositoriesWorld;
let service: HttpService;

async function connect(url: string) {
  return service.send('POST', '/repositories', { body: { url } });
}

/** Makes `git` answer only once its caller stops it, and keeps the signal. */
function gitThatHolds(): AbortSignal[] {
  const signals: AbortSignal[] = [];
  world.git.readDefaultBranch = async (
    _url: RepositoryUrl,
    signal?: AbortSignal,
  ) => {
    if (signal !== undefined) {
      signals.push(signal);
    }
    await new Promise((resolve) => {
      signal?.addEventListener('abort', resolve, { once: true });
    });
    return { outcome: 'refused', output: 'stopped' };
  };
  return signals;
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  service = await startHttpService({
    controllers: [RepositoriesController],
    providers: [
      { provide: ConnectRepositoryHandler, useValue: world.connect },
      { provide: ListRepositoriesHandler, useValue: world.listRepositories },
      { provide: GetRepositoryViewHandler, useValue: world.getRepositoryView },
    ],
  });
});

afterEach(async () => {
  await service.close();
});

describe('RepositoriesController', () => {
  describe('POST /repositories', () => {
    it('should answer 201 with the repository it connected', async () => {
      const answer = await connect(URL);

      expect(answer.status).toBe(201);
      expect(repositorySchema.parse(answer.body)).toEqual({
        id: FIRST_ID,
        owner: 'acme',
        name: 'widgets',
        url: URL,
        defaultBranch: 'main',
        connectedAt: STORED_TIME,
        latestSnapshot: null,
        activeScanId: null,
        headCommit: null,
        outdated: false,
        threshold: { metric: 'lines', percentage: 80, isDefault: true },
      });
    });

    describe('when it was connected before', () => {
      it('should answer 200 with its snapshot and its scan', async () => {
        await world.connected();
        world.coverage.answer = {
          latestSnapshot: latestSnapshot(),
          activeScanId: SCAN_ID,
        };

        const answer = await connect(URL);

        expect(answer.status).toBe(200);
        expect(repositorySchema.parse(answer.body)).toMatchObject({
          id: WIDGETS_ID.value,
          latestSnapshot: { id: SNAPSHOT_ID },
          activeScanId: SCAN_ID,
        });
      });
    });

    describe('when the repository cannot be connected', () => {
      it('should answer 400 invalid_request for an address of another host', async () => {
        const answer = await connect('https://gitlab.com/acme/widgets');

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body)).toMatchObject({
          error: 'invalid_request',
          message: expect.stringContaining('github.com') as unknown,
        });
        expect(world.git.calls).toEqual([]);
      });

      it('should answer 404 not_found with what git said', async () => {
        world.git.defaultBranchAnswer = {
          outcome: 'refused',
          output: 'Repository not found.',
        };

        const answer = await connect(URL);

        expect(answer).toEqual({
          status: 404,
          body: errorSchema.parse({
            error: 'not_found',
            message:
              'git could not read acme/widgets. It said: Repository not found.',
          }),
        });
      });
    });

    describe('when the body does not match its schema', () => {
      it('should answer 400 and connect nothing', async () => {
        const answer = await connect('http://github.com/acme/widgets');

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        expect(world.git.calls).toEqual([]);
        expect(world.repositories.saves).toEqual([]);
      });
    });

    describe('when the client goes away before the answer', () => {
      it('should stop the connection with the signal of the request', async () => {
        const signals = gitThatHolds();

        await service.abandon('POST', '/repositories', { body: { url: URL } });

        await expect
          .poll(() => signals.map((signal) => signal.aborted))
          .toEqual([true]);
      });
    });
  });

  describe('GET /repositories', () => {
    it('should answer 200 with each repository, its snapshot and its age', async () => {
      const widgets = await world.connected();
      widgets.recordHead({
        commit: CommitSha.create(MOVED_HEAD),
        readAt: world.clock.now(),
      });
      world.coverage.answer = {
        latestSnapshot: latestSnapshot(),
        activeScanId: null,
      };

      const answer = await service.send('GET', '/repositories');

      expect(answer.status).toBe(200);
      expect(repositoryListSchema.parse(answer.body).items).toMatchObject([
        {
          id: WIDGETS_ID.value,
          headCommit: MOVED_HEAD,
          outdated: true,
          latestSnapshot: {
            id: SNAPSHOT_ID,
            commitSha: SNAPSHOT_COMMIT,
            threshold: { metric: 'lines', percentage: 80 },
            files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
          },
        },
      ]);
    });

    it('should answer 200 with no item when nothing is connected', async () => {
      const answer = await service.send('GET', '/repositories');

      expect(answer.status).toBe(200);
      expect(repositoryListSchema.parse(answer.body)).toEqual({ items: [] });
    });
  });

  describe('GET /repositories/:id', () => {
    it('should answer 200 with the repository', async () => {
      await world.connected();

      const answer = await service.send('GET', WIDGETS);

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body)).toMatchObject({
        id: WIDGETS_ID.value,
        latestSnapshot: null,
        outdated: false,
      });
    });

    describe('when no repository has the id', () => {
      it.each([
        ['another id', WIDGETS],
        ['a text that is no id', '/repositories/acme'],
      ])('should answer 404 for %s', async (_case, path) => {
        const answer = await service.send('GET', path);

        expect(answer).toEqual({ status: 404, body: NO_REPOSITORY });
      });
    });

    describe('when the id does not match its schema', () => {
      it('should answer 400', async () => {
        const long = `/repositories/${'a'.repeat(65)}`;

        const answer = await service.send('GET', long);

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      });
    });
  });
});
