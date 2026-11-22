import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  CONTRACT_VERSION,
  healthSchema,
  stopServiceResultSchema,
} from '@coverage-autopilot/api-contracts/health';
import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';

import type { RunningService } from '#infrastructure/service/running-service';
import {
  type HostedService,
  hostedService,
  WORK_WAIT,
} from '#tests/support/hosted-service';
import { lockfileOf } from '#tests/support/project-folder';
import { SERVICE_VERSION } from '#tests/support/service-bench';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

const STOP = { method: 'POST' } as const;

let hosted: HostedService;

afterEach(async () => {
  await hosted.close();
});

async function started(): Promise<RunningService> {
  const run = await hosted.bench.run();
  if (run.outcome !== 'running') {
    throw new Error('The service of the test did not start.');
  }
  return run.service;
}

/** A scan of `acme/widgets` whose install never ends. */
async function scanThatRuns(): Promise<void> {
  hosted.host.createRepository('acme/widgets', {
    'package.json': '{"name":"widgets","devDependencies":{"jest":"^30.5.2"}}',
    'package-lock.json': lockfileOf({ jest: '30.5.2' }),
  });
  const connected = await hosted.send('/repositories', {
    method: 'POST',
    body: { url: TemporaryCodeHost.urlOf('acme/widgets') },
  });
  const { id } = repositorySchema.parse(connected.body);
  await hosted.send(`/repositories/${id}/scans`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'scan-1' },
  });
  await expect
    .poll(async () => {
      const health = healthSchema.parse((await hosted.send('/health')).body);
      return health.activeWork.scans;
    }, WORK_WAIT)
    .toBe(1);
}

/** Connects `acme/widgets` and gives its id. */
async function connectedWidgets(): Promise<string> {
  hosted.host.createRepository('acme/widgets', {
    'package.json': '{"name":"widgets"}',
  });
  const connected = await hosted.send('/repositories', {
    method: 'POST',
    body: { url: TemporaryCodeHost.urlOf('acme/widgets') },
  });
  return repositorySchema.parse(connected.body).id;
}

/** The threshold a route answers a repository with. */
async function thresholdAfter(path: string, asked?: { body: unknown }) {
  const answer = await hosted.send(
    path,
    asked === undefined ? {} : { method: 'POST', ...asked },
  );
  return repositorySchema.parse(answer.body).threshold;
}

describe('the routes of the service', () => {
  describe('GET /health', () => {
    it('should answer what the service knows of itself in the words of the contract', async () => {
      hosted = hostedService({});
      const service = await started();

      const answer = await hosted.send('/health');

      expect(answer.status).toBe(200);
      expect(healthSchema.parse(answer.body)).toEqual({
        ready: true,
        contractVersion: CONTRACT_VERSION,
        serviceVersion: SERVICE_VERSION,
        startedAt: service.startedAt.toString(),
        githubAccount: null,
        generator: {
          cli: 'claude_code',
          billing: 'subscription',
          limits: null,
        },
        worker: { alive: true, lastSeenAt: null },
        activeWork: { scans: 0, improvements: 0 },
        tools: [],
      });
    });
  });

  describe('POST /repositories/:id/threshold', () => {
    it('should keep a percent of its own over the default its variable names', async () => {
      hosted = hostedService({}, { AUTOPILOT_COVERAGE_THRESHOLD: '70' });
      await started();
      const path = `/repositories/${await connectedWidgets()}`;
      const own = { body: { percentage: 95 } };
      const none = { body: { percentage: null } };

      expect(await thresholdAfter(path)).toEqual({
        metric: 'lines',
        percentage: 70,
        isDefault: true,
      });
      expect(await thresholdAfter(`${path}/threshold`, own)).toEqual({
        metric: 'lines',
        percentage: 95,
        isDefault: false,
      });
      expect(await thresholdAfter(path)).toMatchObject({ percentage: 95 });
      expect(await thresholdAfter(`${path}/threshold`, none)).toEqual({
        metric: 'lines',
        percentage: 70,
        isDefault: true,
      });
    });
  });

  describe('POST /service/stop', () => {
    it('should answer 202, then stop and give the instance to the next service', async () => {
      hosted = hostedService({});
      const service = await started();

      const answer = await hosted.send('/service/stop', STOP);
      await service.stopped;

      expect(answer.status).toBe(202);
      expect(stopServiceResultSchema.parse(answer.body)).toEqual({
        stopping: true,
      });
      expect(existsSync(hosted.bench.config.instance.socket)).toBe(false);
      expect(hosted.bench.lockIsFree()).toBe(true);
    });

    describe('when a job runs', () => {
      it('should answer 409 and go on as before', async () => {
        hosted = hostedService({ endless: true });
        const service = await started();
        await scanThatRuns();

        const answer = await hosted.send('/service/stop', STOP);
        const health = await hosted.send('/health');

        expect(answer.status).toBe(409);
        expect(errorSchema.parse(answer.body).error).toBe('status_conflict');
        expect(service.stopping).toBe(false);
        expect(healthSchema.parse(health.body)).toMatchObject({
          ready: true,
          activeWork: { scans: 1 },
        });
        expect(hosted.bench.lockIsFree()).toBe(false);
      });
    });
  });
});
