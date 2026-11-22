import { z } from 'zod';

import type { VerificationSettings } from '#verification/application/verification-settings';
import { InvalidVerificationSettingsError } from '#verification/infrastructure/errors/invalid-verification-settings.error';
import type { MutationSettings } from '#verification/infrastructure/mutation/mutation-settings';

/** A version as npm takes one after `@`: three numbers and an optional tag. */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

const environmentSchema = z.record(z.string(), z.string());

const settingsSchema = z.object({
  gate: z.object({
    typeCheckTimeoutMs: z.int().positive(),
    mutationRunTimeoutMs: z.int().positive(),
    survivingMutantLimit: z.int().positive(),
    commandEnvironment: environmentSchema,
    baselineTests: z.enum(['may_fail', 'must_pass']),
  }),
  mutation: z.object({
    toolVersion: z.string().regex(VERSION),
    concurrency: z.int().positive(),
    mutantTimeoutFactor: z.number().positive(),
    mutantTimeoutMs: z.int().nonnegative(),
    installTimeoutMs: z.int().positive(),
    commandEnvironment: environmentSchema,
  }),
});

/**
 * Refuses settings that cannot work, as the service starts rather than at
 * the first patch. The version of the tool becomes an argument of an
 * install, so it must be a version and nothing else. The message names
 * what is wrong and never a value of an environment.
 */
export function checkVerificationSettings(
  gate: VerificationSettings,
  mutation: MutationSettings,
): void {
  const parsed = settingsSchema.safeParse({ gate, mutation });
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.code}`,
    );
    throw new InvalidVerificationSettingsError(
      `The settings of the quality gate cannot work. ${problems.join(', ')}.`,
    );
  }
}
