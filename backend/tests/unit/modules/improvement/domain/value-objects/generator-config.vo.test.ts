import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  BILLINGS,
  GENERATOR_CLIS,
  GeneratorConfig,
  type GeneratorConfigProps,
} from '#improvement/domain/value-objects/generator-config.vo';

const CONFIG: GeneratorConfigProps = {
  cli: 'claude_code',
  model: 'claude-sonnet',
  promptVersion: 'v1',
  billing: 'api_key',
};

describe('GeneratorConfig', () => {
  it('should name the CLIs and the ways to pay of the contract', () => {
    expect(GENERATOR_CLIS).toEqual(['claude_code']);
    expect(BILLINGS).toEqual(['subscription', 'api_key']);
  });

  describe('create', () => {
    it('should keep the CLI, the model, the prompt and who pays', () => {
      const config = GeneratorConfig.create(CONFIG);

      expect([
        config.cli,
        config.model,
        config.promptVersion,
        config.billing,
      ]).toEqual(['claude_code', 'claude-sonnet', 'v1', 'api_key']);
    });

    describe('when the service could not start it', () => {
      it.each([
        { cli: 'codex' },
        { billing: 'credit_card' },
        { model: ' ' },
        { promptVersion: '' },
      ])('should throw InvalidImprovementValueError for %o', (change) => {
        expect(() =>
          GeneratorConfig.create({
            ...CONFIG,
            ...change,
          } as GeneratorConfigProps),
        ).toThrow(InvalidImprovementValueError);
      });

      it('should say what it was given', () => {
        expect(() => GeneratorConfig.create({ ...CONFIG, model: '' })).toThrow(
          new InvalidImprovementValueError(
            'claude_code with the model "", the prompt "v1" and the billing ' +
              'api_key is not a generator the service can start.',
          ),
        );
      });
    });
  });
});
