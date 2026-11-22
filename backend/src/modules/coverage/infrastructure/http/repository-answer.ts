import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { RepositoryViewDto } from '#coverage/application/dto/repository-view.dto';
import { snapshotSummaryOf } from '#coverage/infrastructure/http/snapshot-answer';

/** A repository in the words of the contract. */
export function repositoryAnswerOf(repository: RepositoryViewDto): Repository {
  const { latestSnapshot } = repository;
  return {
    id: repository.id.value,
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    connectedAt: repository.connectedAt.toString(),
    latestSnapshot:
      latestSnapshot === null ? null : snapshotSummaryOf(latestSnapshot),
    activeScanId: repository.activeScanId,
    headCommit: repository.headCommit?.value ?? null,
    outdated: repository.outdated,
  };
}
