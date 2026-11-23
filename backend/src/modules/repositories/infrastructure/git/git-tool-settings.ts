import { devNull } from 'node:os';

import type { ToolSettings } from '#repositories/infrastructure/repositories-settings';

/**
 * Before the arguments of every call: git starts no hook and no file
 * system monitor, whatever a configuration says. The service never wants
 * a program of a configuration to run for it.
 */
const NO_PROGRAMS = [
  '-c',
  `core.hooksPath=${devNull}`,
  '-c',
  'core.fsmonitor=false',
];

/**
 * The variables that give git configuration: `GIT_CONFIG_GLOBAL`,
 * `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_PARAMETERS` and
 * the entries of `GIT_CONFIG_COUNT`.
 */
const CONFIGURATION_VARIABLES = 'GIT_CONFIG';

/**
 * git as the settings configure it, for the calls that reach the host of
 * the code or the mirror: they need what the operator configured, such
 * as a helper for credentials, and they read no tree a sandbox wrote.
 */
export function hostGit(settings: ToolSettings): ToolSettings {
  return { ...settings, command: [...settings.command, ...NO_PROGRAMS] };
}

/**
 * git that reads no configuration but the one of the repository it is
 * given, for the work on a working copy, whose tree untrusted code wrote.
 * A filter, a diff or merge driver, a hook or a monitor is a program a
 * configuration names, and a `.gitattributes` of the tree may select any
 * one a configuration defines. So no global, system or environment
 * configuration is read: a program only the operator meant for their own
 * work can never be selected by the tree. The other variables, such as
 * the identity of the author, stay as the settings give them.
 */
export function isolatedGit(settings: ToolSettings): ToolSettings {
  const kept = Object.entries(settings.environment).filter(
    ([name]) => !name.startsWith(CONFIGURATION_VARIABLES),
  );
  return {
    ...hostGit(settings),
    environment: {
      ...Object.fromEntries(kept),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: devNull,
      GIT_CONFIG_GLOBAL: devNull,
    },
  };
}
