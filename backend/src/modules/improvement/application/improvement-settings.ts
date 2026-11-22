import type { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import type { GeneratorConfig } from '#improvement/domain/value-objects/generator-config.vo';
import type { ImprovementMode } from '#improvement/domain/value-objects/improvement-mode.vo';
import type { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';

/** The limits of one call of the generator, whatever the budget is. */
export interface GenerationCallLimits {
  readonly maxTurns: number;
  /** `null` under a subscription, where a price of a call means nothing. */
  readonly maxCostUsd: number | null;
  /** A call is also given no more than what is left of the budget. */
  readonly timeoutMs: number;
}

/**
 * What the service fills a request for an improvement with, and how it
 * runs one. The service passes one value of them. A request never
 * changes who pays or which prompt is used: both come from here alone.
 */
export interface ImprovementSettings {
  readonly budget: BudgetSettings;
  /** The mode of a request that names none. */
  readonly mode: ImprovementMode;
  /** The quality gate of a request that names none. */
  readonly policy: QualityPolicy;
  /**
   * The generator of a request that names none. A request may choose the
   * CLI and the model, and takes the prompt and the billing from here.
   */
  readonly generator: GeneratorConfig;
  readonly generation: GenerationCallLimits;
  /** How the name of a file the generator may add ends, as `.test.ts`. */
  readonly testFileSuffixes: readonly string[];
  /**
   * How long an improvement waits for the window of a subscription when
   * the generator did not say when it opens.
   */
  readonly limitWaitMs: number;
}

/** The injection token of the settings of the improvement module. */
export const IMPROVEMENT_SETTINGS = Symbol('ImprovementSettings');
