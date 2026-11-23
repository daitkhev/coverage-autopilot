import { describe, expect, it } from 'vitest';

import { loadWith } from '#tests/support/service-variables';

describe('generatorOf', () => {
  it('should take the generator from its variables', () => {
    const config = loadWith({
      AUTOPILOT_SANDBOX_MEMORY_MB: '1024',
      AUTOPILOT_GENERATOR_BILLING: 'api_key',
      AUTOPILOT_GENERATOR_MODEL: 'claude-opus-4-1',
      AUTOPILOT_GENERATOR_IMAGE: 'registry.local/generator@sha256:def',
      AUTOPILOT_GENERATOR_OUTPUT_BYTES: '8388608',
      AUTOPILOT_GENERATOR_MAX_TURNS: '8',
      AUTOPILOT_GENERATOR_MAX_COST_USD: '0.25',
      AUTOPILOT_GENERATOR_TIMEOUT_MS: '300000',
      AUTOPILOT_GENERATOR_LIMIT_WAIT_MS: '900000',
    });

    expect(config.generator).toMatchObject({
      cli: 'claude_code',
      billing: 'api_key',
      model: 'claude-opus-4-1',
      call: { maxTurns: 8, maxCostUsd: 0.25, timeoutMs: 300_000 },
      limitWaitMs: 900_000,
      sandbox: {
        image: 'registry.local/generator@sha256:def',
        limits: { memoryMb: 1024, outputBytes: 8_388_608 },
      },
    });
  });

  it('should run the generator with the engine, the instance and the user of the commands', () => {
    const config = loadWith({
      AUTOPILOT_SANDBOX_ENGINE: '["podman"]',
      AUTOPILOT_SANDBOX_UID: '1001',
    });

    expect(config.generator.sandbox.engine).toEqual(config.sandbox.engine);
    expect(config.generator.sandbox.instance).toBe(config.sandbox.instance);
    expect(config.generator.sandbox.user).toBe('1001:20');
    expect(config.generator.sandbox.image).not.toBe(config.sandbox.image);
  });

  describe('when a subscription pays for the generator', () => {
    it('should log in with the token of a subscription, without its space', () => {
      const config = loadWith({
        CLAUDE_CODE_OAUTH_TOKEN: ' zz-private-oauth\n',
        ANTHROPIC_API_KEY: 'zz-private-key',
      });

      expect(config.generator.credential).toEqual({
        variable: 'CLAUDE_CODE_OAUTH_TOKEN',
        value: 'zz-private-oauth',
      });
    });

    it('should have no credential when the token is not set', () => {
      const config = loadWith({
        ANTHROPIC_API_KEY: 'zz-private-key',
        CLAUDE_CODE_OAUTH_TOKEN: '  ',
      });

      expect(config.generator.credential).toEqual({
        variable: 'CLAUDE_CODE_OAUTH_TOKEN',
        value: null,
      });
    });

    it('should put no price on a call', () => {
      expect(loadWith({}).generator.call.maxCostUsd).toBeNull();
    });
  });

  describe('when a key pays for the generator', () => {
    it('should limit the price of a call by default', () => {
      const config = loadWith({ AUTOPILOT_GENERATOR_BILLING: 'api_key' });

      expect(config.generator.call.maxCostUsd).toBe(1);
    });

    it('should log in with the key, and not with a token of a subscription', () => {
      const config = loadWith({
        AUTOPILOT_GENERATOR_BILLING: 'api_key',
        CLAUDE_CODE_OAUTH_TOKEN: 'zz-private-oauth',
        ANTHROPIC_API_KEY: 'zz-private-key',
      });

      expect(config.generator.credential).toEqual({
        variable: 'ANTHROPIC_API_KEY',
        value: 'zz-private-key',
      });
    });

    it('should have no credential when only a token of a subscription is set', () => {
      const config = loadWith({
        AUTOPILOT_GENERATOR_BILLING: 'api_key',
        CLAUDE_CODE_OAUTH_TOKEN: 'zz-private-oauth',
      });

      expect(config.generator.credential).toEqual({
        variable: 'ANTHROPIC_API_KEY',
        value: null,
      });
    });
  });
});
