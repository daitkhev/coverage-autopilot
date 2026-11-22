import type { RepositoryInstallDto } from '#repositories/application/contracts/repositories-public-api';

/**
 * How a repository that made no choice of its own is installed: the
 * setting of the service.
 */
export type DefaultInstall = Omit<RepositoryInstallDto, 'isDefault'>;

/** The injection token of the default install. */
export const DEFAULT_INSTALL = Symbol('DefaultInstall');
