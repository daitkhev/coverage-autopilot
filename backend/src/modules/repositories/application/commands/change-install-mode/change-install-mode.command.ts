import type { InstallMode } from '#repositories/domain/value-objects/install-mode.vo';

/**
 * Give a repository a mode of install of its own, or `null` to install it
 * by the default of the service again.
 */
export interface ChangeInstallModeCommand {
  readonly repositoryId: string;
  readonly mode: InstallMode | null;
}
