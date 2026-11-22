import type { RepositoryThresholdDto } from '#repositories/application/contracts/repositories-public-api';

/**
 * What the files of a repository with no threshold of its own are judged
 * by: the setting of the service.
 */
export type DefaultThreshold = Omit<RepositoryThresholdDto, 'isDefault'>;

/** The injection token of the default threshold. */
export const DEFAULT_THRESHOLD = Symbol('DefaultThreshold');
