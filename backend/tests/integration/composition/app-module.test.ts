import { PassThrough } from 'node:stream';

import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '#composition/app.module';
import { IMPROVEMENT_SETTINGS } from '#improvement/application/improvement-settings';
import { GENERATOR_SANDBOX } from '#improvement/infrastructure/generator/generator-sandbox';
import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import { Instant } from '#kernel/time/instant';
import { JOB_HANDLERS, type JobHandler } from '#ports/job-handler.port';
import { SANDBOX, type Sandbox } from '#ports/sandbox.port';
import { DEFAULT_INSTALL } from '#repositories/application/default-install';
import { DEFAULT_THRESHOLD } from '#repositories/application/default-threshold';
import { loadWith } from '#tests/support/service-variables';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const ANYWHERE = { strict: false };

let database: TemporaryDatabase | undefined;
let module: TestingModule | undefined;

/** The root module over a migrated database, as a run would build it. */
async function serviceWith(
  variables: Record<string, string>,
): Promise<TestingModule> {
  database = createMigratedDatabase();
  module = await Test.createTestingModule({
    imports: [
      AppModule.register({
        config: loadWith(variables),
        connection: database.connection,
        logStream: new PassThrough(),
        life: {
          version: '0.0.0-test',
          startedAt: Instant.parse('2026-11-22T08:00:00.000Z'),
          stopping: false,
          stop: async () => Promise.resolve(),
        },
      }),
    ],
  }).compile();
  return module.init();
}

afterEach(async () => {
  await module?.close();
  database?.remove();
});

describe('AppModule', () => {
  it('should give the worker the handler of scans and of improvements', async () => {
    const service = await serviceWith({});

    const handlers = service.get<JobHandler[]>(JOB_HANDLERS);

    expect(handlers.map((handler) => handler.kind)).toEqual([
      'scan',
      'improvement',
    ]);
  });

  it('should run the generator in a sandbox of its own', async () => {
    const service = await serviceWith({});

    const generator = service.get<Sandbox>(GENERATOR_SANDBOX, ANYWHERE);

    expect(generator).toBeInstanceOf(DockerSandbox);
    expect(generator).not.toBe(service.get(SANDBOX));
  });

  it('should judge the files of a repository by 80% of lines by default', async () => {
    const service = await serviceWith({});

    expect(service.get(DEFAULT_THRESHOLD, ANYWHERE)).toEqual({
      metric: 'lines',
      percentage: 80,
    });
  });

  it('should judge them by the percent of lines its variable names', async () => {
    const service = await serviceWith({ AUTOPILOT_COVERAGE_THRESHOLD: '95' });

    expect(service.get(DEFAULT_THRESHOLD, ANYWHERE)).toEqual({
      metric: 'lines',
      percentage: 95,
    });
  });

  it('should install a repository that chose nothing sandboxed by default', async () => {
    const service = await serviceWith({});

    expect(service.get(DEFAULT_INSTALL, ANYWHERE)).toEqual({
      mode: 'sandboxed',
    });
  });

  it('should install it as its variable says', async () => {
    const service = await serviceWith({ AUTOPILOT_INSTALL: 'trusted' });

    expect(service.get(DEFAULT_INSTALL, ANYWHERE)).toEqual({ mode: 'trusted' });
  });

  describe('when the generator has no credential', () => {
    it('should tell the module of improvements which one is missing', async () => {
      const service = await serviceWith({
        AUTOPILOT_GENERATOR_BILLING: 'api_key',
      });

      expect(service.get(IMPROVEMENT_SETTINGS, ANYWHERE)).toMatchObject({
        missingCredential: 'ANTHROPIC_API_KEY',
      });
    });
  });

  describe('when the generator has its credential', () => {
    it('should tell the module of improvements that none is missing', async () => {
      const service = await serviceWith({
        CLAUDE_CODE_OAUTH_TOKEN: 'zz-token',
      });

      expect(service.get(IMPROVEMENT_SETTINGS, ANYWHERE)).toMatchObject({
        missingCredential: null,
      });
    });
  });
});
