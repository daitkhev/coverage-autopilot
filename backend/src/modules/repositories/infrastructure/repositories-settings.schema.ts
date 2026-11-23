import { isAbsolute } from 'node:path';

import { z } from 'zod';

import { INSTALL_MODES } from '#repositories/domain/value-objects/install-mode.vo';
import { InvalidRepositoriesSettingsError } from '#repositories/infrastructure/errors/invalid-repositories-settings.error';
import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';

const toolSettingsSchema = z.object({
  command: z.array(z.string().min(1)).min(1),
  environment: z.record(z.string(), z.string()),
  timeoutMs: z.int().positive(),
  outputLimitBytes: z.int().positive().optional(),
});

/**
 * A commit on a working copy reads no configuration of git, so without
 * these git would make up who commits from the user and the machine.
 */
const WHO_COMMITS = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
];

const gitSettingsSchema = toolSettingsSchema.extend({
  environment: toolSettingsSchema.shape.environment.refine(
    (environment) =>
      WHO_COMMITS.every((name) => (environment[name] ?? '') !== ''),
    `The environment of git does not say who commits. It needs ${WHO_COMMITS.join(', ')}.`,
  ),
});

const MOST_PERCENT = 100;

/** A whole percent from 1 to 100, since 0 would make no file a target. */
const thresholdSchema = z.object({
  percentage: z.int().min(1).max(MOST_PERCENT),
});

/** What the settings must be for the module to work at all. */
const repositoriesSettingsSchema = z.object({
  threshold: thresholdSchema,
  install: z.object({ mode: z.enum(INSTALL_MODES) }),
  workingCopiesRoot: z
    .string()
    .refine(isAbsolute, 'The root of the working copies is not absolute.'),
  git: gitSettingsSchema,
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
