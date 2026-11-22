import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { SnapshotSummary } from '@coverage-autopilot/api-contracts/snapshots';

import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';

/** The newest snapshot of a repository, as the coverage module gives it. */
type SnapshotView = NonNullable<RepositoryViewDto['latestSnapshot']>;

function summaryOf(snapshot: SnapshotView): SnapshotSummary {
  return {
    id: snapshot.id,
    commitSha: snapshot.commit.value,
    capturedAt: snapshot.capturedAt.toString(),
    totals: snapshot.totals,
    threshold: snapshot.threshold,
    files: snapshot.files,
  };
}

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
    latestSnapshot: latestSnapshot === null ? null : summaryOf(latestSnapshot),
    activeScanId: repository.activeScanId,
    headCommit: repository.headCommit?.value ?? null,
    outdated: repository.outdated,
    threshold: repository.threshold,
  };
}
