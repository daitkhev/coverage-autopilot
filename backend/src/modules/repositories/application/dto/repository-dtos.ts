import type { RepositoryId } from '#kernel/primitives/repository-id';
import type {
  AccessCheckDto,
  RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import type { AccessCheck } from '#repositories/domain/value-objects/access-check.vo';

/** What another module or a route sees of a repository: values only. */
export function toRepositoryDto(repository: Repository): RepositoryDto {
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
    steps: check.steps,
  };
}
