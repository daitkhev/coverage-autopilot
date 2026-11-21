import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  loadServiceConfig,
  SERVICE_CONFIG,
  type ServiceConfig,
} from '#infrastructure/config/service-config';
import {
  loadWith,
  PLAIN_MACHINE,
  refusal,
} from '#tests/support/service-variables';

describe('loadServiceConfig', () => {
  it('should fill every setting that is not set with its default', () => {
    expect(loadServiceConfig(PLAIN_MACHINE)).toEqual({
      instance: {
        directory: '/home/dev/.coverage-autopilot',
        database: '/home/dev/.coverage-autopilot/service.sqlite',
        lock: '/home/dev/.coverage-autopilot/instance.lock',
        socket: '/home/dev/.coverage-autopilot/service.sock',
        artifacts: '/home/dev/.coverage-autopilot/artifacts',
        workingCopies: '/home/dev/.coverage-autopilot/working-copies',
      },
      logLevel: 'info',
      secrets: [],
      sandbox: {
        engine: { command: ['docker'], environment: PLAIN_MACHINE },
        image: 'node:24-slim',
        user: '1000:1000',
        limits: {
          memoryMb: 4096,
          cpus: 2,
          processes: 512,
          scratchMb: 512,
          outputBytes: 1_048_576,
        },
      },
      queue: {
        leaseMs: 60_000,
        heartbeatMs: 20_000,
        maxRuns: 3,
        pollMs: 1_000,
        concurrency: 2,
      },
      generator: { cli: 'claude_code', billing: 'subscription' },
      budget: {
        defaults: { attempts: 3, minutes: 30, tokens: null },
        maximums: { attempts: 10, minutes: 120, tokens: null },
      },
    });
  });

  it('should take every setting from its variable', () => {
    const config = loadWith({
      AUTOPILOT_INSTANCE_DIR: '/srv/autopilot/./instance/',
      AUTOPILOT_LOG_LEVEL: 'debug',
      AUTOPILOT_SANDBOX_ENGINE: '["/opt/bin/podman", "--remote"]',
      AUTOPILOT_SANDBOX_IMAGE: 'registry.local/sandbox@sha256:abc',
      AUTOPILOT_SANDBOX_USER: '501:20',
      AUTOPILOT_SANDBOX_MEMORY_MB: '1024',
      AUTOPILOT_SANDBOX_CPUS: '0.5',
      AUTOPILOT_SANDBOX_PROCESSES: '64',
      AUTOPILOT_SANDBOX_SCRATCH_MB: '32',
      AUTOPILOT_SANDBOX_OUTPUT_BYTES: '4096',
      AUTOPILOT_QUEUE_LEASE_MS: '30000',
      AUTOPILOT_QUEUE_HEARTBEAT_MS: '10000',
      AUTOPILOT_QUEUE_MAX_RUNS: '5',
      AUTOPILOT_QUEUE_POLL_MS: '250',
      AUTOPILOT_QUEUE_CONCURRENCY: '4',
      AUTOPILOT_GENERATOR: 'claude_code',
      AUTOPILOT_GENERATOR_BILLING: 'api_key',
      AUTOPILOT_BUDGET_ATTEMPTS: '2',
      AUTOPILOT_BUDGET_MAX_ATTEMPTS: '4',
      AUTOPILOT_BUDGET_MINUTES: '15',
      AUTOPILOT_BUDGET_MAX_MINUTES: '60',
      AUTOPILOT_BUDGET_TOKENS: '200000',
      AUTOPILOT_BUDGET_MAX_TOKENS: '400000',
    });

    expect(config).toMatchObject({
      instance: {
        directory: '/srv/autopilot/instance',
        socket: '/srv/autopilot/instance/service.sock',
      },
      logLevel: 'debug',
      sandbox: {
        engine: { command: ['/opt/bin/podman', '--remote'] },
        image: 'registry.local/sandbox@sha256:abc',
        user: '501:20',
        limits: {
          memoryMb: 1024,
          cpus: 0.5,
          processes: 64,
          scratchMb: 32,
          outputBytes: 4096,
        },
      },
      queue: {
        leaseMs: 30_000,
        heartbeatMs: 10_000,
        maxRuns: 5,
        pollMs: 250,
        concurrency: 4,
      },
      generator: { cli: 'claude_code', billing: 'api_key' },
      budget: {
        defaults: { attempts: 2, minutes: 15, tokens: 200_000 },
        maximums: { attempts: 4, minutes: 60, tokens: 400_000 },
      },
    });
  });

  it('should take an empty or blank variable for one that is not set', () => {
    const config = loadWith({
      AUTOPILOT_LOG_LEVEL: '',
      AUTOPILOT_QUEUE_MAX_RUNS: '   ',
      AUTOPILOT_SANDBOX_CPUS: ' 3 ',
    });

    expect(config.logLevel).toBe('info');
    expect(config.queue.maxRuns).toBe(3);
    expect(config.sandbox.limits.cpus).toBe(3);
  });

  it('should give a frozen value, to its last level', () => {
    const config = loadServiceConfig(PLAIN_MACHINE);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sandbox.engine.command)).toBe(true);
    expect(Object.isFrozen(config.budget.defaults)).toBe(true);
    expect(() => {
      Object.assign(config.queue, { leaseMs: 1 });
    }).toThrow(TypeError);
  });

  it('should start the engine with the variables it needs and no other', () => {
    const config = loadWith({
      DOCKER_HOST: 'unix:///run/user/1000/docker.sock',
      XDG_RUNTIME_DIR: '/run/user/1000',
      GH_TOKEN: 'zz-private',
      NODE_OPTIONS: '--require /tmp/hook.js',
      AUTOPILOT_LOG_LEVEL: 'warn',
    });

    expect(config.sandbox.engine.environment).toEqual({
      ...PLAIN_MACHINE,
      DOCKER_HOST: 'unix:///run/user/1000/docker.sock',
      XDG_RUNTIME_DIR: '/run/user/1000',
    });
  });

  it('should give the credentials of the environment to hide', () => {
    const config = loadWith({
      GH_TOKEN: 'zz-private-one\n',
      CLAUDE_CODE_OAUTH_TOKEN: 'zz-private-two',
      GITHUB_TOKEN: '',
    });

    expect(config.secrets).toEqual(['zz-private-one', 'zz-private-two']);
  });

  describe('when a key pays for the generator', () => {
    it('should limit the tokens by default', () => {
      const config = loadWith({ AUTOPILOT_GENERATOR_BILLING: 'api_key' });

      expect(config.budget).toEqual({
        defaults: { attempts: 3, minutes: 30, tokens: 1_000_000 },
        maximums: { attempts: 10, minutes: 120, tokens: 5_000_000 },
      });
    });

    it('should refuse a default above the maximum of tokens', () => {
      expect(() =>
        loadWith({
          AUTOPILOT_GENERATOR_BILLING: 'api_key',
          AUTOPILOT_BUDGET_TOKENS: '6000000',
        }),
      ).toThrow(
        refusal(
          'AUTOPILOT_BUDGET_TOKENS: expected a whole number at most ' +
            'AUTOPILOT_BUDGET_MAX_TOKENS.',
        ),
      );
    });
  });

  describe('when it is injected by its token', () => {
    it('should be the configuration the module was given', async () => {
      const config = loadServiceConfig(PLAIN_MACHINE);
      const module = await Test.createTestingModule({
        providers: [{ provide: SERVICE_CONFIG, useValue: config }],
      }).compile();

      expect(module.get<ServiceConfig>(SERVICE_CONFIG)).toBe(config);
      expect(SERVICE_CONFIG.description).toBe('ServiceConfig');
    });
  });
});
