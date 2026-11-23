import { describe, expect, it } from 'vitest';

import { moduleSettingsOf } from '#composition/module-settings';
import { loadWith } from '#tests/support/service-variables';

const IN_THE_IMAGE = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp',
  CI: 'true',
};

describe('moduleSettingsOf', () => {
  it('should give the commands of a repository their limits and their variables', () => {
    const settings = moduleSettingsOf(
      loadWith({
        AUTOPILOT_INSTALL_TIMEOUT_MS: '120000',
        AUTOPILOT_TEST_RUN_TIMEOUT_MS: '240000',
        AUTOPILOT_TYPE_CHECK_TIMEOUT_MS: '60000',
        AUTOPILOT_MUTATION_RUN_TIMEOUT_MS: '900000',
        AUTOPILOT_MUTATION_CONCURRENCY: '4',
      }),
    );

    expect(settings.coverage).toEqual({
      installTimeoutMs: 120_000,
      testRunTimeoutMs: 240_000,
      commandEnvironment: IN_THE_IMAGE,
    });
    expect(settings.verification).toEqual({
      gate: {
        typeCheckTimeoutMs: 60_000,
        mutationRunTimeoutMs: 900_000,
        survivingMutantLimit: 10,
        commandEnvironment: IN_THE_IMAGE,
        baselineTests: 'may_fail',
      },
      mutation: {
        toolVersion: '10.1.1',
        concurrency: 4,
        mutantTimeoutFactor: 1.5,
        mutantTimeoutMs: 5_000,
        installTimeoutMs: 120_000,
        commandEnvironment: IN_THE_IMAGE,
      },
    });
  });

  it('should give the gate the way the tests of a commit are judged', () => {
    const settings = moduleSettingsOf(
      loadWith({ AUTOPILOT_BASELINE_TESTS: 'must_pass' }),
    );

    expect(settings.verification.gate.baselineTests).toBe('must_pass');
  });

  it('should fill a request that names nothing from the configuration', () => {
    const config = loadWith({
      AUTOPILOT_GENERATOR_BILLING: 'api_key',
      AUTOPILOT_GENERATOR_MODEL: 'opus',
      ANTHROPIC_API_KEY: 'zz-key',
    });

    const { improvement } = moduleSettingsOf(config);

    expect(improvement).toMatchObject({
      budget: config.budget,
      mode: 'automatic',
      policy: { repeatedRuns: 3, mutationThreshold: 50 },
      generator: {
        cli: 'claude_code',
        model: 'opus',
        promptVersion: '2',
        billing: 'api_key',
      },
      generation: config.generator.call,
      testFileSuffixes: ['.test.ts', '.test.tsx'],
      limitWaitMs: config.generator.limitWaitMs,
      sandbox: config.generator.sandbox,
    });
    expect(improvement.policy.requiredChecks).toHaveLength(7);
  });

  it('should start the CLI with its tools and the credential of its billing', () => {
    const { improvement } = moduleSettingsOf(
      loadWith({ CLAUDE_CODE_OAUTH_TOKEN: 'zz-token' }),
    );

    expect(improvement.adapter).toEqual({
      command: ['claude'],
      allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      credential: { variable: 'CLAUDE_CODE_OAUTH_TOKEN', value: 'zz-token' },
      environment: { PATH: IN_THE_IMAGE.PATH },
      scan: { maxFiles: 100, maxFileBytes: 1_048_576 },
    });
  });
});
