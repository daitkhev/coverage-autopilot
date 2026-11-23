import { z } from 'zod';

import type { ImprovementSettings } from '#improvement/application/improvement-settings';
import { InvalidImprovementSettingsError } from '#improvement/infrastructure/errors/invalid-improvement-settings.error';
import type { GeneratorSettings } from '#improvement/infrastructure/generator/generator-settings';

/** The end of a file name, such as `.test.ts`. */
const SUFFIX = /^\.[\w.-]+$/u;

/** The name of a variable of an environment. */
const VARIABLE = /^[A-Z_][A-Z0-9_]*$/u;

const word = z.string().min(1);

const settingsSchema = z.object({
  generation: z.object({
    maxTurns: z.int().positive(),
    maxCostUsd: z.number().positive().nullable(),
    timeoutMs: z.int().positive(),
  }),
  testFileSuffixes: z.array(z.string().regex(SUFFIX)).min(1),
  limitWaitMs: z.int().positive(),
  generator: z.object({
    command: z.array(word).min(1),
    allowedTools: z.array(word).min(1),
    credential: z.object({
      variable: z.string().regex(VARIABLE),
      value: word.nullable(),
    }),
  }),
});

/**
 * A limit of tokens and a price of a call exist with a key alone. A
 * default budget that disagrees with who pays would have the domain
 * refuse every request, and a price under a subscription means nothing.
 */
function billingProblemsOf(settings: ImprovementSettings): string[] {
  const paysByKey = settings.generator.billing === 'api_key';
  const limited = settings.budget.defaults.tokens !== null;
  const priced = settings.generation.maxCostUsd !== null;
  return [
    ...(limited === paysByKey ? [] : ['budget.tokens: billing_mismatch']),
    ...(priced && !paysByKey
      ? ['generation.maxCostUsd: billing_mismatch']
      : []),
  ];
}

/**
 * A request that names no quality policy gets the one of the settings,
 * so a policy the gate refuses would fail every such request.
 */
function policyProblemsOf(settings: ImprovementSettings): string[] {
  return settings.policy.isUsable ? [] : ['policy.requiredChecks: unusable'];
}

/**
 * Refuses settings no improvement can run with, as the service starts
 * rather than at the first request. A credential that is not set is no
 * fault: the service then scans, and refuses a request for an improvement.
 * An empty one is. The message names what is wrong and never a value,
 * because one of the values is the credential.
 */
export function checkImprovementSettings(
  settings: ImprovementSettings,
  generator: GeneratorSettings,
): void {
  const parsed = settingsSchema.safeParse({ ...settings, generator });
  const problems = [
    ...(parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.code}`,
        )),
    ...billingProblemsOf(settings),
    ...policyProblemsOf(settings),
  ];
  if (problems.length > 0) {
    throw new InvalidImprovementSettingsError(
      `The settings of an improvement cannot work. ${problems.join(', ')}.`,
    );
  }
}
