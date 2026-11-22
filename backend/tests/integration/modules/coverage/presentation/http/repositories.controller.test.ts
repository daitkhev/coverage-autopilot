import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  repositoryListSchema,
  repositorySchema,
} from '@coverage-autopilot/api-contracts/repositories';
import { scanSchema } from '@coverage-autopilot/api-contracts/scans';
import { snapshotListSchema } from '@coverage-autopilot/api-contracts/snapshots';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { Instant } from '#kernel/time/instant';
import {
  CAPTURED_AT,
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
  snapshotOf,
} from '#tests/support/coverage-snapshots';
import { heldBy } from '#tests/support/repository-view-world';
import {
  type CoverageRoutes,
  startCoverageRoutes,
} from '#tests/support/route-coverage';
import { QUEUED_AT } from '#tests/support/scan-jobs';

const WIDGETS = `/repositories/${REPOSITORY_ID}`;

const URL = 'https://github.com/acme/widgets';

const KEY = { 'Idempotency-Key': 'key-1' };

const NEWER_ID = '00000000-0000-4000-8000-0000000000ab';

const MOVED_HEAD = 'd'.repeat(40);

const NO_REPOSITORY = errorSchema.parse({
  error: 'not_found',
  message: 'No connected repository has this id.',
});

type Answer = Awaited<ReturnType<CoverageRoutes['service']['send']>>;

let routes: CoverageRoutes;

async function connect(url: string): Promise<Answer> {
  return routes.service.send('POST', '/repositories', { body: { url } });
}

/** Asks for a scan of `acme/widgets`. */
async function scan(
  headers: Readonly<Record<string, string>> = KEY,
  body?: unknown,
): Promise<Answer> {
  return routes.service.send('POST', `${WIDGETS}/scans`, { headers, body });
}

/** The scan `acme/widgets` waits for, as the routes tell it. */
async function activeScanId(): Promise<string | null> {
  const answer = await routes.service.send('GET', WIDGETS);
  return repositorySchema.parse(answer.body).activeScanId;
}

beforeEach(async () => {
  routes = await startCoverageRoutes();
});

afterEach(async () => {
  await routes.close();
});

describe('RepositoriesController', () => {
  describe('POST /repositories', () => {
    it('should answer 201 with the repository it connected', async () => {
      const answer = await connect(URL);

      expect(answer.status).toBe(201);
      expect(repositorySchema.parse(answer.body)).toEqual({
        id: REPOSITORY_ID,
        owner: 'acme',
        name: 'widgets',
        url: 'https://github.com/acme/widgets.git',
        defaultBranch: 'main',
        connectedAt: CAPTURED_AT,
        latestSnapshot: null,
        activeScanId: null,
        headCommit: null,
        outdated: false,
      });
      expect(routes.connections.urls).toEqual([URL]);
    });

    describe('when it was connected before', () => {
      it('should answer 200 with its snapshot and its scan', async () => {
        await routes.store(fixtureSnapshot());
        const scanId = routes.scanJob();
        routes.connections.answer = {
          outcome: 'already_connected',
          repository: heldBy(routes.repositories),
        };

        const answer = await connect(URL);

        expect(answer.status).toBe(200);
        expect(repositorySchema.parse(answer.body)).toMatchObject({
          latestSnapshot: { id: SNAPSHOT_ID },
          activeScanId: scanId,
        });
      });
    });

    describe('when the repository cannot be connected', () => {
      it.each([
        { outcome: 'invalid_url', status: 400, error: 'invalid_request' },
        { outcome: 'unreachable', status: 404, error: 'not_found' },
      ] as const)(
        'should answer $status $error with the reason of $outcome',
        async ({ outcome, status, error }) => {
          const reason = 'git could not read acme/widgets.';
          routes.connections.answer = { outcome, reason };

          const answer = await connect(URL);

          expect(answer).toEqual({
            status,
            body: errorSchema.parse({ error, message: reason }),
          });
        },
      );
    });

    describe('when the body does not match its schema', () => {
      it('should answer 400 and connect nothing', async () => {
        const answer = await connect('http://github.com/acme/widgets');

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        expect(routes.connections.urls).toEqual([]);
      });
    });

    /*
     * The service in a test hangs up only on a request with no body, which
     * this route refuses before it connects, so the test of the hang-up
     * itself is the one of the access check.
     */
    it('should hand the connection the signal of the request', async () => {
      const seen: AbortSignal[] = [];
      const connections = routes.connections;
      const answerOf = connections.connectRepository.bind(connections);
      connections.connectRepository = async (request, signal) => {
        seen.push(signal);
        return answerOf(request, signal);
      };

      await connect(URL);

      expect(seen).toEqual([expect.any(AbortSignal)]);
    });
  });

  describe('GET /repositories', () => {
    it('should answer 200 with each repository, its snapshot and its age', async () => {
      await routes.store(snapshotOf());
      routes.repositories.repository = {
        ...heldBy(routes.repositories),
        headCommit: CommitSha.create(MOVED_HEAD),
        headCheckedAt: Instant.parse(QUEUED_AT),
      };

      const answer = await routes.service.send('GET', '/repositories');

      expect(answer.status).toBe(200);
      expect(repositoryListSchema.parse(answer.body).items).toMatchObject([
        {
          id: REPOSITORY_ID,
          headCommit: MOVED_HEAD,
          outdated: true,
          latestSnapshot: {
            id: SNAPSHOT_ID,
            commitSha: SNAPSHOT_COMMIT,
            capturedAt: CAPTURED_AT,
            threshold: { metric: 'lines', percentage: 80 },
            files: { below: 0, above: 0, unmeasured: 0, noCode: 0 },
          },
        },
      ]);
    });

    it('should answer 200 with no item when nothing is connected', async () => {
      routes.repositories.repository = null;

      const answer = await routes.service.send('GET', '/repositories');

      expect(answer.status).toBe(200);
      expect(repositoryListSchema.parse(answer.body)).toEqual({ items: [] });
    });
  });

  describe('GET /repositories/:id', () => {
    it('should answer 200 with the repository', async () => {
      const answer = await routes.service.send('GET', WIDGETS);

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body)).toMatchObject({
        id: REPOSITORY_ID,
        latestSnapshot: null,
        outdated: false,
      });
    });

    describe('when no repository has the id', () => {
      it('should answer 404', async () => {
        routes.repositories.repository = null;

        const answer = await routes.service.send('GET', WIDGETS);

        expect(answer).toEqual({ status: 404, body: NO_REPOSITORY });
      });

      it('should answer 404 for a text that is no id', async () => {
        const answer = await routes.service.send('GET', '/repositories/acme');

        expect(answer).toEqual({ status: 404, body: NO_REPOSITORY });
      });
    });

    describe('when the id does not match its schema', () => {
      it.each(['', '/snapshots'])(
        'should answer 400 to GET :id%s',
        async (rest) => {
          const long = `/repositories/${'a'.repeat(65)}${rest}`;

          const answer = await routes.service.send('GET', long);

          expect(answer.status).toBe(400);
          expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        },
      );
    });
  });

  describe('POST /repositories/:id/scans', () => {
    it('should answer 202 with the scan it queued', async () => {
      const answer = await scan();

      expect(answer.status).toBe(202);
      const queued = scanSchema.parse(answer.body);
      expect(queued).toEqual({
        id: queued.id,
        repositoryId: REPOSITORY_ID,
        status: 'queued',
        queuedAt: QUEUED_AT,
        startedAt: null,
        finishedAt: null,
        progress: null,
        snapshotId: null,
        failure: null,
      });
      expect(await activeScanId()).toBe(queued.id);
    });

    describe('when the key was used for this repository', () => {
      it('should answer 200 with the scan the key queued', async () => {
        const first = await scan(KEY, {});

        const again = await scan(KEY, {});

        expect(again.status).toBe(200);
        expect(scanSchema.parse(again.body).id).toBe(
          scanSchema.parse(first.body).id,
        );
      });
    });

    describe('when the key was used for another repository', () => {
      it('should answer 409 request_key_reused', async () => {
        routes.scanJob({
          idempotency_key: 'scan:key-1',
          serialization_key: NEWER_ID,
        });

        const answer = await scan();

        expect(answer).toEqual({
          status: 409,
          body: errorSchema.parse({
            error: 'request_key_reused',
            message:
              'The request key was used for a scan of another repository.',
          }),
        });
      });
    });

    describe('when no repository has the id', () => {
      it('should answer 404', async () => {
        routes.repositories.repository = null;

        const answer = await scan();

        expect(answer).toEqual({ status: 404, body: NO_REPOSITORY });
      });
    });

    describe('when the request does not match its schema', () => {
      it.each([
        ['no key', {}, undefined],
        ['a key with a space', { 'Idempotency-Key': 'key 1' }, undefined],
        ['a field in the body', KEY, { force: true }],
      ])('should answer 400 for %s', async (_case, headers, body) => {
        const answer = await scan(headers, body);

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        expect(await activeScanId()).toBe(null);
      });
    });
  });

  describe('GET /repositories/:id/snapshots', () => {
    it('should answer 200 with the snapshots, the newest first', async () => {
      await routes.store(fixtureSnapshot());
      await routes.store(
        snapshotOf({
          id: NEWER_ID,
          originKey: 'scan:newer',
          capturedAt: '2026-03-05T05:06:07.008Z',
        }),
      );

      const answer = await routes.service.send('GET', `${WIDGETS}/snapshots`);

      expect(answer.status).toBe(200);
      const { items } = snapshotListSchema.parse(answer.body);
      expect(items.map(({ id }) => id)).toEqual([NEWER_ID, SNAPSHOT_ID]);
      expect(items[1]).toMatchObject({
        repositoryId: REPOSITORY_ID,
        commitSha: SNAPSHOT_COMMIT,
        totals: { lines: { covered: 2, total: 6 } },
        files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
        parameters: {
          testRunner: 'jest',
          testRunnerVersion: '30.5.2',
          coverageProvider: 'babel',
          packageManager: 'npm',
          configFile: 'jest.config.json',
          fileListRule: 'default-sources-v1',
        },
      });
    });

    it('should answer 200 with no item for a repository never scanned', async () => {
      const answer = await routes.service.send('GET', `${WIDGETS}/snapshots`);

      expect(answer.status).toBe(200);
      expect(snapshotListSchema.parse(answer.body)).toEqual({ items: [] });
    });

    describe('when no repository has the id', () => {
      it('should answer 404', async () => {
        const path = '/repositories/acme/snapshots';

        const answer = await routes.service.send('GET', path);

        expect(answer).toEqual({ status: 404, body: NO_REPOSITORY });
      });
    });
  });
});
