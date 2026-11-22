import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { scanSchema } from '@coverage-autopilot/api-contracts/scans';
import { snapshotListSchema } from '@coverage-autopilot/api-contracts/snapshots';

import {
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
  snapshotOf,
} from '#tests/support/coverage-snapshots';
import {
  type CoverageRoutes,
  startCoverageRoutes,
} from '#tests/support/route-coverage';
import { QUEUED_AT } from '#tests/support/scan-jobs';

const WIDGETS = `/repositories/${REPOSITORY_ID}`;

const KEY = { 'Idempotency-Key': 'key-1' };

const NEWER_ID = '00000000-0000-4000-8000-0000000000ab';

const NO_REPOSITORY = errorSchema.parse({
  error: 'not_found',
  message: 'No connected repository has this id.',
});

type Answer = Awaited<ReturnType<CoverageRoutes['service']['send']>>;

let routes: CoverageRoutes;

/** Asks for a scan of `acme/widgets`. */
async function scan(
  headers: Readonly<Record<string, string>> = KEY,
  body?: unknown,
): Promise<Answer> {
  return routes.service.send('POST', `${WIDGETS}/scans`, { headers, body });
}

beforeEach(async () => {
  routes = await startCoverageRoutes();
});

afterEach(async () => {
  await routes.close();
});

describe('RepositoryCoverageController', () => {
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
      expect(await routes.openScanId()).toBe(queued.id);
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
        expect(await routes.openScanId()).toBe(null);
      });
    });
  });

  describe('GET /repositories/:id/snapshots', () => {
    it('should answer 200 with the snapshots, the newest first', async () => {
      await routes.store(fixtureSnapshot({ tests: { ran: 53, failed: 33 } }));
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
        tests: { ran: 53, failed: 33 },
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

    describe('when the id does not match its schema', () => {
      it('should answer 400', async () => {
        const long = `/repositories/${'a'.repeat(65)}/snapshots`;

        const answer = await routes.service.send('GET', long);

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      });
    });
  });
});
