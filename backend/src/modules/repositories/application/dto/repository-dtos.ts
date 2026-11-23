import type { RepositoryId } from '#kernel/primitives/repository-id';
import type {
  AccessCheckDto,
  RepositoryDto,
  RepositoryInstallDto,
  RepositoryThresholdDto,
} from '#repositories/application/contracts/repositories-public-api';
import type { DefaultInstall } from '#repositories/application/default-install';
import type { DefaultThreshold } from '#repositories/application/default-threshold';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import type { AccessCheck } from '#repositories/domain/value-objects/access-check.vo';

/** Its own percent of the metric of the service, or the default whole. */
function thresholdOf(
  repository: Repository,
  fallback: DefaultThreshold,
): RepositoryThresholdDto {
  const own = repository.threshold;
  return own === null
    ? { ...fallback, isDefault: true }
    : { metric: fallback.metric, percentage: own.value, isDefault: false };
}

/** Its own choice, or the default of the service. */
function installOf(
  repository: Repository,
  fallback: DefaultInstall,
): RepositoryInstallDto {
  const own = repository.installMode;
  return own === null
    ? { ...fallback, isDefault: true }
    : { mode: own, isDefault: false };
}

/**
 * What another module or a route sees of a repository: values only, with
 * the threshold its files are judged by now and how it is installed now.
 */
export function toRepositoryDto(
  repository: Repository,
  fallback: DefaultThreshold,
  install: DefaultInstall,
): RepositoryDto {
  const head = repository.head;
  return {
    id: repository.id,
    owner: repository.url.owner,
    name: repository.url.name,
    url: repository.url.value,
    defaultBranch: repository.defaultBranch.value,
    connectedAt: repository.connectedAt,
    headCommit: head?.commit ?? null,
    headCheckedAt: head?.readAt ?? null,
    threshold: thresholdOf(repository, fallback),
    install: installOf(repository, install),
  };
}

export function toAccessCheckDto(
  repositoryId: RepositoryId,
  check: AccessCheck,
): AccessCheckDto {
  return {
    repositoryId,
    checkedAt: check.checkedAt,
    passed: check.passed,
    headCommit: check.headCommit,
    destination: check.destination,
    steps: check.steps,
  };
}
