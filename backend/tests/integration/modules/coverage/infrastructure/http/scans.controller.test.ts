import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { scanSchema } from '@coverage-autopilot/api-contracts/scans';

import { REPOSITORY_ID, SNAPSHOT_ID } from '#tests/support/coverage-snapshots';
import {
  type CoverageRoutes,
  startCoverageRoutes,
} from '#tests/support/route-coverage';
import { ENDED_AT, QUEUED_AT, STARTED_AT } from '#tests/support/scan-jobs';
import type { Row } from '#tests/support/schema-rows';

const MINUTE_MS = 60_000;

/** What a scan job of each status holds, as the worker writes it. */
const QUEUED = { created_at: QUEUED_AT };

const RUNNING = {
  ...QUEUED,
  status: 'leased',
  runs: 1,
  lease_expires_at: ENDED_AT,
  started_at: STARTED_AT,
};

function endedWith(outcome: object): Row {
  return {
    ...RUNNING,
    status: 'completed',
    lease_expires_at: null,
    outcome: JSON.stringify({ version: 1, ...outcome }),
    updated_at: ENDED_AT,
  };
}

let routes: CoverageRoutes;

beforeEach(async () => {
  routes = await startCoverageRoutes();
});

afterEach(async () => {
  await routes.close();
});

describe('ScansController', () => {
  describe('GET /scans/:id', () => {
    it('should answer 200 with a scan that waits in the queue', async () => {
      const id = routes.scanJob(QUEUED);

      const answer = await routes.service.send('GET', `/scans/${id}`);

      expect(answer.status).toBe(200);
      expect(scanSchema.parse(answer.body)).toEqual({
        id,
        repositoryId: REPOSITORY_ID,
        status: 'queued',
        queuedAt: QUEUED_AT,
        startedAt: null,
        finishedAt: null,
        progress: null,
        snapshotId: null,
        failure: null,
      });
    });

    it('should answer 200 with the steps of a running scan', async () => {
      const steps = [
        { code: 'clone', status: 'passed' },
        { code: 'test_run', status: 'running', done: 1, total: 3 },
      ];
      const id = routes.scanJob({
        ...RUNNING,
        progress: JSON.stringify({ version: 1, steps }),
        progress_updated_at: STARTED_AT,
      });

      const answer = await routes.service.send('GET', `/scans/${id}`);

      expect(scanSchema.parse(answer.body)).toMatchObject({
        status: 'running',
        startedAt: STARTED_AT,
        progress: { steps, updatedAt: STARTED_AT },
      });
    });

    it('should answer 200 with the snapshot of a scan that completed', async () => {
      const id = routes.scanJob(
        endedWith({ outcome: 'captured', snapshotId: SNAPSHOT_ID }),
      );

      const answer = await routes.service.send('GET', `/scans/${id}`);

      expect(scanSchema.parse(answer.body)).toMatchObject({
        status: 'completed',
        finishedAt: ENDED_AT,
        snapshotId: SNAPSHOT_ID,
        failure: null,
      });
    });

    describe('when the tests ran past the time limit of the scan', () => {
      it('should answer the failure with the reason of the same name', async () => {
        const id = routes.scanJob(
          endedWith({ outcome: 'test_run_timed_out', outputReference: null }),
        );

        const answer = await routes.service.send('GET', `/scans/${id}`);

        expect(scanSchema.parse(answer.body)).toMatchObject({
          status: 'failed',
          snapshotId: null,
          failure: {
            reason: 'test_run_timed_out',
            message:
              'The tests ran past the time limit of a scan, so no file was measured.',
          },
        });
      });
    });

    describe('when no scan has the id', () => {
      it('should answer 404 for an id no job has', async () => {
        const answer = await routes.service.send(
          'GET',
          `/scans/${SNAPSHOT_ID}`,
        );

        expect(answer).toEqual({
          status: 404,
          body: errorSchema.parse({
            error: 'not_found',
            message: 'No scan has this id.',
          }),
        });
      });

      it('should answer 404 for the job of an improvement', async () => {
        const id = routes.scanJob({ kind: 'improvement' });

        const answer = await routes.service.send('GET', `/scans/${id}`);

        expect(answer.status).toBe(404);
      });
    });

    describe('when the id does not match its schema', () => {
      it('should answer 400', async () => {
        const answer = await routes.service.send(
          'GET',
          `/scans/${'a'.repeat(65)}`,
        );

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      });
    });
  });

  describe('POST /scans/:id/cancel', () => {
    it('should answer 202 with the scan it cancelled', async () => {
      const id = routes.scanJob(QUEUED);
      routes.clock.advance(MINUTE_MS);

      const answer = await routes.service.send('POST', `/scans/${id}/cancel`);

      expect(answer.status).toBe(202);
      expect(scanSchema.parse(answer.body)).toMatchObject({
        id,
        status: 'cancelled',
        finishedAt: routes.clock.now().toString(),
      });
    });

    it('should take an empty body as well as none', async () => {
      const id = routes.scanJob(RUNNING);

      const answer = await routes.service.send('POST', `/scans/${id}/cancel`, {
        body: {},
      });

      expect(answer.status).toBe(202);
      expect(scanSchema.parse(answer.body).status).toBe('cancelled');
    });

    describe('when the scan ended', () => {
      it('should answer 202 with the scan as it ended', async () => {
        const id = routes.scanJob(
          endedWith({ outcome: 'captured', snapshotId: SNAPSHOT_ID }),
        );

        const answer = await routes.service.send('POST', `/scans/${id}/cancel`);

        expect(answer.status).toBe(202);
        expect(scanSchema.parse(answer.body)).toMatchObject({
          status: 'completed',
          finishedAt: ENDED_AT,
        });
      });
    });

    describe('when no scan has the id', () => {
      it('should answer 404', async () => {
        const answer = await routes.service.send(
          'POST',
          `/scans/${SNAPSHOT_ID}/cancel`,
        );

        expect(answer.status).toBe(404);
        expect(errorSchema.parse(answer.body).error).toBe('not_found');
      });
    });

    describe('when the body holds anything', () => {
      it('should answer 400 and cancel nothing', async () => {
        const id = routes.scanJob(QUEUED);

        const answer = await routes.service.send(
          'POST',
          `/scans/${id}/cancel`,
          { body: { force: true } },
        );
        const scan = await routes.service.send('GET', `/scans/${id}`);

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        expect(scanSchema.parse(scan.body).status).toBe('queued');
      });
    });
  });
});
