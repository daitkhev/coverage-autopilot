import { isAbsolute } from 'node:path';

import { z } from 'zod';

import { InvalidRepositoriesSettingsError } from '#repositories/infrastructure/errors/invalid-repositories-settings.error';
import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';

const toolSettingsSchema = z.object({
  command: z.array(z.string().min(1)).min(1),
  environment: z.record(z.string(), z.string()),
  timeoutMs: z.int().positive(),
  outputLimitBytes: z.int().positive().optional(),
});

/** What the settings must be for the module to work at all. */
const repositoriesSettingsSchema = z.object({
  workingCopiesRoot: z
    .string()
    .refine(isAbsolute, 'The root of the working copies is not absolute.'),
  git: toolSettingsSchema,
  gh: toolSettingsSchema,
  secretVariables: z.array(z.string().min(1)),
});

/**
 * Refuses settings that cannot work, as the service starts rather than at
 * the first clone. The message names what is wrong and never a value, so
 * a secret of an environment stays out of it.
 */
export function checkSettings(settings: RepositoriesSettings): void {
  const parsed = repositoriesSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    throw new InvalidRepositoriesSettingsError(
      `The settings of the repositories module cannot work.\n${z.prettifyError(parsed.error)}`,
    );
  }
}
