import { describe, expect, it } from 'vitest';

import { InvalidServiceConfigError } from '#infrastructure/config/errors/invalid-service-config.error';
import {
  loadServiceConfig,
  type ServiceConfig,
} from '#infrastructure/config/service-config';
import {
  DEVELOPER,
  loadWith,
  PLAIN_MACHINE,
  refusal,
} from '#tests/support/service-variables';

describe('loadServiceConfig', () => {
  describe('when the instance folder cannot hold the socket', () => {
    const SOCKET = '/service.sock';

    it('should accept a socket path of 104 bytes', () => {
      const directory = `/${'d'.repeat(104 - SOCKET.length - 1)}`;

      const config = loadWith({ AUTOPILOT_INSTANCE_DIR: directory });

      expect(Buffer.byteLength(config.instance.socket)).toBe(104);
    });

    it('should refuse a longer one, counted in bytes', () => {
      const directory = `/${'é'.repeat(45)}x`;

      expect(() => loadWith({ AUTOPILOT_INSTANCE_DIR: directory })).toThrow(
        refusal(
          'AUTOPILOT_INSTANCE_DIR: expected a folder short enough that the ' +
            'path of the socket in it is at most 104 bytes, and it is 105. ' +
            'The service does not change its working directory to make it ' +
            'shorter.',
        ),
      );
    });

    it('should refuse a home that makes the default too long', () => {
      expect(() =>
        loadServiceConfig({ HOME: `/${'h'.repeat(80)}` }, DEVELOPER),
      ).toThrow(InvalidServiceConfigError);
    });
  });

  describe('when the instance folder is not absolute', () => {
    const expected =
      'AUTOPILOT_INSTANCE_DIR: expected an absolute path of a folder, or, ' +
      'when it is not set, an absolute HOME to put the default under.';

    it.each([
      [
        'a relative folder',
        { ...PLAIN_MACHINE, AUTOPILOT_INSTANCE_DIR: 'instance' },
      ],
      ['no folder and no home', {}],
      ['no folder and a relative home', { HOME: 'home/dev' }],
    ])('should throw InvalidServiceConfigError for %s', (_case, variables) => {
      expect(() => loadServiceConfig(variables, DEVELOPER)).toThrow(
        refusal(expected),
      );
    });
  });

  describe('when a variable is wrong', () => {
    it.each([
      ['AUTOPILOT_LOG_LEVEL', 'trace', 'debug, info, warn or error'],
      ['AUTOPILOT_SANDBOX_IMAGE', '--privileged', 'the name of an image'],
      ['AUTOPILOT_SANDBOX_IMAGE', 'node 24', 'the name of an image'],
      ['AUTOPILOT_SANDBOX_UID', '0', 'a whole number above 0, so that no'],
      ['AUTOPILOT_SANDBOX_UID', '501:20', 'a whole number above 0, so that'],
      ['AUTOPILOT_SANDBOX_GID', '0', 'a whole number above 0, so that no'],
      ['AUTOPILOT_SANDBOX_GID', 'staff', 'a whole number above 0, so that'],
      ['AUTOPILOT_SANDBOX_CPUS', '0', 'a number above 0'],
      ['AUTOPILOT_SANDBOX_CPUS', 'two', 'a number above 0'],
      ['AUTOPILOT_SANDBOX_MEMORY_MB', '1.5', 'a whole number above 0'],
      ['AUTOPILOT_QUEUE_LEASE_MS', '-1', 'a whole number above 0'],
      ['AUTOPILOT_QUEUE_POLL_MS', '1e3', 'a whole number above 0'],
      ['AUTOPILOT_QUEUE_MAX_RUNS', '9007199254740993', 'a whole number'],
      ['AUTOPILOT_SANDBOX_ENGINE', 'docker', 'a JSON list of the program'],
      ['AUTOPILOT_SANDBOX_ENGINE', '[]', 'a JSON list of the program'],
      ['AUTOPILOT_SANDBOX_ENGINE', '[""]', 'a JSON list of the program'],
      ['AUTOPILOT_SANDBOX_ENGINE', '["docker", 1]', 'a JSON list'],
      ['AUTOPILOT_GENERATOR', 'codex', 'claude_code'],
      ['AUTOPILOT_GENERATOR_BILLING', 'free', 'subscription or api_key'],
      ['AUTOPILOT_COVERAGE_THRESHOLD', '0', 'a whole number from 1 to 100'],
      ['AUTOPILOT_COVERAGE_THRESHOLD', '101', 'a whole number from 1 to 100'],
      ['AUTOPILOT_COVERAGE_THRESHOLD', '85.5', 'a whole number from 1 to'],
      ['AUTOPILOT_COVERAGE_THRESHOLD', '80%', 'a whole number from 1 to 100'],
      ['AUTOPILOT_INSTALL_TIMEOUT_MS', '10m', 'a whole number above 0'],
      ['AUTOPILOT_TEST_RUN_TIMEOUT_MS', '0', 'a whole number above 0'],
      ['AUTOPILOT_TYPE_CHECK_TIMEOUT_MS', '-5', 'a whole number above 0'],
      ['AUTOPILOT_MUTATION_RUN_TIMEOUT_MS', '1.5', 'a whole number above'],
      ['AUTOPILOT_MUTATION_CONCURRENCY', 'all', 'a whole number above 0'],
      ['AUTOPILOT_GIT_TIMEOUT_MS', '0', 'a whole number above 0'],
      ['AUTOPILOT_GH_TIMEOUT_MS', 'soon', 'a whole number above 0'],
      ['AUTOPILOT_GENERATOR_MODEL', '--dangerous', 'the name of a model'],
      ['AUTOPILOT_GENERATOR_MODEL', 'claude sonnet', 'the name of a model'],
      ['AUTOPILOT_GENERATOR_IMAGE', '--privileged', 'the name of an image'],
      ['AUTOPILOT_GENERATOR_OUTPUT_BYTES', '16MB', 'a whole number above'],
      ['AUTOPILOT_GENERATOR_MAX_TURNS', '0', 'a whole number above 0'],
      ['AUTOPILOT_GENERATOR_TIMEOUT_MS', '1e5', 'a whole number above 0'],
      ['AUTOPILOT_GENERATOR_LIMIT_WAIT_MS', '1h', 'a whole number above'],
      ['AUTOPILOT_GIT_AUTHOR_NAME', 'Ada <ada@example.com>', 'a name on one'],
      ['AUTOPILOT_GIT_AUTHOR_NAME', 'Ada\nTester', 'a name on one line'],
      ['AUTOPILOT_GIT_AUTHOR_EMAIL', 'ada', 'an address such as'],
      ['AUTOPILOT_GIT_AUTHOR_EMAIL', '<ada@example.com>', 'an address such'],
      ['AUTOPILOT_GIT_AUTHOR_EMAIL', 'ada @example.com', 'an address such'],
    ])('should refuse %s=%s', (variable, value, expected) => {
      const loading = (): ServiceConfig => loadWith({ [variable]: value });

      expect(loading).toThrow(InvalidServiceConfigError);
      expect(loading).toThrow(`${variable}: expected ${expected}`);
    });

    it('should name every wrong variable at once, and never a value', () => {
      const loading = (): ServiceConfig =>
        loadWith({
          AUTOPILOT_SANDBOX_CPUS: 'zz-private',
          AUTOPILOT_SANDBOX_ENGINE: '["zz-private"',
          AUTOPILOT_QUEUE_HEARTBEAT_MS: '60000',
          AUTOPILOT_BUDGET_ATTEMPTS: '11',
          AUTOPILOT_BUDGET_TOKENS: 'zz-private',
        });

      expect(loading).toThrow(
        refusal(
          'AUTOPILOT_SANDBOX_ENGINE: expected a JSON list of the program and ' +
            'its arguments, such as ["docker"].',
          'AUTOPILOT_SANDBOX_CPUS: expected a number above 0.',
          'AUTOPILOT_BUDGET_TOKENS: expected a whole number above 0.',
          'AUTOPILOT_QUEUE_HEARTBEAT_MS: expected a whole number below ' +
            'AUTOPILOT_QUEUE_LEASE_MS, so that a lease is renewed before it ' +
            'runs out.',
          'AUTOPILOT_BUDGET_ATTEMPTS: expected a whole number at most ' +
            'AUTOPILOT_BUDGET_MAX_ATTEMPTS.',
        ),
      );
      expect(loading).toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining('zz-private') as unknown,
        }),
      );
    });

    it('should refuse a limit of tokens under a subscription', () => {
      expect(() =>
        loadWith({
          AUTOPILOT_BUDGET_TOKENS: '1000',
          AUTOPILOT_BUDGET_MAX_TOKENS: '2000',
        }),
      ).toThrow(
        refusal(
          ...['AUTOPILOT_BUDGET_TOKENS', 'AUTOPILOT_BUDGET_MAX_TOKENS'].map(
            (variable) =>
              `${variable}: expected no value: the windows of a subscription ` +
              'limit the generator, and a limit of tokens needs ' +
              'AUTOPILOT_GENERATOR_BILLING=api_key.',
          ),
        ),
      );
    });

    it('should refuse a price of a call under a subscription', () => {
      expect(() =>
        loadWith({ AUTOPILOT_GENERATOR_MAX_COST_USD: '0.5' }),
      ).toThrow(
        refusal(
          'AUTOPILOT_GENERATOR_MAX_COST_USD: expected no value: a call under ' +
            'a subscription has no price, and a limit of cost needs ' +
            'AUTOPILOT_GENERATOR_BILLING=api_key.',
        ),
      );
    });

    it.each(['0', 'free', '-1'])(
      'should refuse the price %s of a call with a key',
      (price) => {
        expect(() =>
          loadWith({
            AUTOPILOT_GENERATOR_BILLING: 'api_key',
            AUTOPILOT_GENERATOR_MAX_COST_USD: price,
          }),
        ).toThrow(
          refusal(
            'AUTOPILOT_GENERATOR_MAX_COST_USD: expected a number above 0.',
          ),
        );
      },
    );

    it('should refuse a default above its maximum', () => {
      expect(() => loadWith({ AUTOPILOT_BUDGET_MAX_MINUTES: '20' })).toThrow(
        refusal(
          'AUTOPILOT_BUDGET_MINUTES: expected a whole number at most ' +
            'AUTOPILOT_BUDGET_MAX_MINUTES.',
        ),
      );
    });

    it('should be a fault that a second start does not mend', () => {
      expect(() => loadWith({ AUTOPILOT_LOG_LEVEL: 'loud' })).toThrow(
        expect.objectContaining({
          code: 'invalid_service_config',
          retryable: false,
        }),
      );
    });
  });
});
