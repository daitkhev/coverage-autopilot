import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** The AI CLIs the service has an adapter for. */
export const GENERATOR_CLIS = ['claude_code'] as const;

export type GeneratorCli = (typeof GENERATOR_CLIS)[number];

/**
 * Who pays for the generator. A subscription has windows of usage and no
 * price of a call, and a key has a price and no windows.
 */
export const BILLINGS = ['subscription', 'api_key'] as const;

export type Billing = (typeof BILLINGS)[number];

export interface GeneratorConfigProps {
  readonly cli: GeneratorCli;
  readonly model: string;
  readonly promptVersion: string;
  /** From the settings of the service, never from a request. */
  readonly billing: Billing;
}

/**
 * Which AI CLI writes the tests, with which model and prompt, and who pays
 * for it. It is part of what the improvement was asked to do, so it never
 * changes afterwards.
 */
export class GeneratorConfig extends ValueObject<GeneratorConfigProps> {
  private constructor(props: GeneratorConfigProps) {
    super(props);
  }

  public static create(props: GeneratorConfigProps): GeneratorConfig {
    const known =
      GENERATOR_CLIS.includes(props.cli) && BILLINGS.includes(props.billing);
    if (
      !known ||
      props.model.trim() === '' ||
      props.promptVersion.trim() === ''
    ) {
      throw new InvalidImprovementValueError(
        `${props.cli} with the model "${props.model}", the prompt ` +
          `"${props.promptVersion}" and the billing ${props.billing} is not ` +
          'a generator the service can start.',
      );
    }
    return new GeneratorConfig(props);
  }

  public get cli(): GeneratorCli {
    return this.props.cli;
  }

  public get model(): string {
    return this.props.model;
  }

  public get promptVersion(): string {
    return this.props.promptVersion;
  }

  public get billing(): Billing {
    return this.props.billing;
  }
}
