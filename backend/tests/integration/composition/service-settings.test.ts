import { PassThrough } from 'node:stream';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { serviceSettingsOf } from '#composition/service-settings';
import { RepositoriesModule } from '#repositories/repositories.module';
import { loadWith, PLAIN_MACHINE } from '#tests/support/service-variables';
import { SharedTestModule } from '#tests/support/shared-test-module';
import { withStandInCoverage } from '#tests/support/stand-in-repository-coverage';

describe('serviceSettingsOf', () => {
  it('should give each part of the service its part of the configuration', () => {
    const config = loadWith({
      AUTOPILOT_INSTANCE_DIR: '/srv/autopilot',
      AUTOPILOT_LOG_LEVEL: 'warn',
      AUTOPILOT_QUEUE_CONCURRENCY: '3',
      AUTOPILOT_GIT_TIMEOUT_MS: '90000',
      AUTOPILOT_GH_TIMEOUT_MS: '15000',
      GH_TOKEN: 'zz-private',
    });
    const stream = new PassThrough();

    expect(serviceSettingsOf(config, stream)).toEqual({
      log: { stream, level: 'warn', secrets: ['zz-private'] },
      worker: {
        leaseMs: 60_000,
        heartbeatMs: 20_000,
        maxRuns: 3,
        pollMs: 1_000,
        jobsAtOnce: 3,
      },
      sandbox: config.sandbox,
      artifacts: '/srv/autopilot/artifacts',
      repositories: {
        workingCopiesRoot: '/srv/autopilot/working-copies',
        git: {
          command: ['git'],
          environment: config.git.environment,
          timeoutMs: 90_000,
        },
        gh: {
          command: ['gh'],
          environment: { ...PLAIN_MACHINE, GH_TOKEN: 'zz-private' },
          timeoutMs: 15_000,
        },
        secretVariables: ['GH_TOKEN', 'GITHUB_TOKEN'],
      },
    });
  });

  it('should give the repositories module settings it starts with', async () => {
    const settings = serviceSettingsOf(loadWith({}), new PassThrough());
    const module = await Test.createTestingModule({
      imports: [
        SharedTestModule.create(),
        withStandInCoverage(RepositoriesModule.register(settings.repositories)),
      ],
    }).compile();

    await expect(module.init()).resolves.toBe(module);
    await module.close();
  });
});
