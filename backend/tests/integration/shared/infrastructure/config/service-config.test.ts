import { createHash } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  loadServiceConfig,
  SERVICE_CONFIG,
  type ServiceConfig,
} from '#infrastructure/config/service-config';
import {
  DEVELOPER,
  loadWith,
  PLAIN_MACHINE,
  refusal,
} from '#tests/support/service-variables';

const SANDBOX_LIMITS = {
  memoryMb: 4096,
  cpus: 2,
  processes: 512,
  scratchMb: 512,
  outputBytes: 1_048_576,
};

/** The SHA-256 of the default folder of the instance of the plain machine. */
const INSTANCE = createHash('sha256')
  .update('/home/dev/.coverage-autopilot')
  .digest('hex');

describe('loadServiceConfig', () => {
  it('should fill every setting that is not set with its default', () => {
    const engine = { command: ['docker'], environment: PLAIN_MACHINE };

    expect(loadServiceConfig(PLAIN_MACHINE, DEVELOPER)).toEqual({
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
        engine,
        instance: INSTANCE,
        image: 'coverage-autopilot-sandbox:26',
        user: '501:20',
        limits: SANDBOX_LIMITS,
      },
      queue: {
        leaseMs: 60_000,
        heartbeatMs: 20_000,
        maxRuns: 3,
        pollMs: 1_000,
        concurrency: 2,
      },
      commands: {
        installTimeoutMs: 600_000,
        testRunTimeoutMs: 900_000,
        typeCheckTimeoutMs: 300_000,
        mutationRunTimeoutMs: 1_800_000,
        mutationConcurrency: 2,
      },
      generator: {
        cli: 'claude_code',
        billing: 'subscription',
        model: 'sonnet',
        credential: { variable: 'CLAUDE_CODE_OAUTH_TOKEN', value: null },
        call: { maxTurns: 20, maxCostUsd: null, timeoutMs: 600_000 },
        limitWaitMs: 3_600_000,
        sandbox: {
          engine,
          instance: INSTANCE,
          image: 'coverage-autopilot-generator:2.1.329',
          user: '501:20',
          limits: { ...SANDBOX_LIMITS, outputBytes: 16_777_216 },
        },
      },
      budget: {
        defaults: { attempts: 3, minutes: 30, tokens: null },
        maximums: { attempts: 10, minutes: 120, tokens: null },
      },
      git: {
        environment: {
          ...PLAIN_MACHINE,
          GIT_AUTHOR_NAME: 'Coverage Autopilot',
          GIT_AUTHOR_EMAIL: 'autopilot@coverage-autopilot.invalid',
          GIT_COMMITTER_NAME: 'Coverage Autopilot',
          GIT_COMMITTER_EMAIL: 'autopilot@coverage-autopilot.invalid',
        },
        timeoutMs: 600_000,
      },
      gh: { environment: PLAIN_MACHINE, timeoutMs: 60_000 },
    });
  });

  describe('when no variable names the user of a command', () => {
    it('should run a command as the user and the group of the service', () => {
      const config = loadServiceConfig(PLAIN_MACHINE, { uid: 1000, gid: 985 });

      expect(config.sandbox.user).toBe('1000:985');
    });

    it('should take the one that is set and keep the other', () => {
      expect(loadWith({ AUTOPILOT_SANDBOX_UID: '1500' }).sandbox.user).toBe(
        '1500:20',
      );
      expect(loadWith({ AUTOPILOT_SANDBOX_GID: '1500' }).sandbox.user).toBe(
        '501:1500',
      );
    });

    it('should refuse a service that runs as root', () => {
      expect(() =>
        loadServiceConfig(PLAIN_MACHINE, { uid: 0, gid: 0 }),
      ).toThrow(
        refusal(
          'AUTOPILOT_SANDBOX_UID: expected a whole number above 0, so that ' +
            'no command runs as root. When it is not set, it is the user ' +
            'the service runs as.',
          'AUTOPILOT_SANDBOX_GID: expected a whole number above 0, so that ' +
            'no command runs in the group of root. When it is not set, it ' +
            'is the group the service runs in.',
        ),
      );
    });

    it('should let a service of root name another user for its commands', () => {
      const config = loadServiceConfig(
        {
          ...PLAIN_MACHINE,
          AUTOPILOT_SANDBOX_UID: '1000',
          AUTOPILOT_SANDBOX_GID: '1000',
        },
        { uid: 0, gid: 0 },
      );

      expect(config.sandbox.user).toBe('1000:1000');
    });
  });

  it('should take every setting from its variable', () => {
    const config = loadWith({
      AUTOPILOT_INSTANCE_DIR: '/srv/autopilot/./instance/',
      AUTOPILOT_LOG_LEVEL: 'debug',
      AUTOPILOT_SANDBOX_ENGINE: '["/opt/bin/podman", "--remote"]',
      AUTOPILOT_SANDBOX_IMAGE: 'registry.local/sandbox@sha256:abc',
      AUTOPILOT_SANDBOX_UID: '1001',
      AUTOPILOT_SANDBOX_GID: '1002',
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
      AUTOPILOT_INSTALL_TIMEOUT_MS: '120000',
      AUTOPILOT_TEST_RUN_TIMEOUT_MS: '240000',
      AUTOPILOT_TYPE_CHECK_TIMEOUT_MS: '60000',
      AUTOPILOT_MUTATION_RUN_TIMEOUT_MS: '480000',
      AUTOPILOT_MUTATION_CONCURRENCY: '6',
      AUTOPILOT_GIT_TIMEOUT_MS: '90000',
      AUTOPILOT_GH_TIMEOUT_MS: '15000',
      AUTOPILOT_GENERATOR: 'claude_code',
      AUTOPILOT_GENERATOR_BILLING: 'api_key',
      AUTOPILOT_BUDGET_ATTEMPTS: '2',
      AUTOPILOT_BUDGET_MAX_ATTEMPTS: '4',
      AUTOPILOT_BUDGET_MINUTES: '15',
      AUTOPILOT_BUDGET_MAX_MINUTES: '60',
      AUTOPILOT_BUDGET_TOKENS: '200000',
      AUTOPILOT_BUDGET_MAX_TOKENS: '400000',
      AUTOPILOT_GIT_AUTHOR_NAME: 'Ada Tester',
      AUTOPILOT_GIT_AUTHOR_EMAIL: 'ada@example.com',
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
        user: '1001:1002',
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
      commands: {
        installTimeoutMs: 120_000,
        testRunTimeoutMs: 240_000,
        typeCheckTimeoutMs: 60_000,
        mutationRunTimeoutMs: 480_000,
        mutationConcurrency: 6,
      },
      generator: { cli: 'claude_code', billing: 'api_key' },
      budget: {
        defaults: { attempts: 2, minutes: 15, tokens: 200_000 },
        maximums: { attempts: 4, minutes: 60, tokens: 400_000 },
      },
      git: {
        environment: {
          GIT_AUTHOR_NAME: 'Ada Tester',
          GIT_AUTHOR_EMAIL: 'ada@example.com',
          GIT_COMMITTER_NAME: 'Ada Tester',
          GIT_COMMITTER_EMAIL: 'ada@example.com',
        },
        timeoutMs: 90_000,
      },
      gh: { timeoutMs: 15_000 },
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
    const config = loadServiceConfig(PLAIN_MACHINE, DEVELOPER);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sandbox.engine.command)).toBe(true);
    expect(Object.isFrozen(config.budget.defaults)).toBe(true);
    expect(() => {
      Object.assign(config.queue, { leaseMs: 1 });
    }).toThrow(TypeError);
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
      const config = loadServiceConfig(PLAIN_MACHINE, DEVELOPER);
      const module = await Test.createTestingModule({
        providers: [{ provide: SERVICE_CONFIG, useValue: config }],
      }).compile();

      expect(module.get<ServiceConfig>(SERVICE_CONFIG)).toBe(config);
      expect(SERVICE_CONFIG.description).toBe('ServiceConfig');
    });
  });
});
