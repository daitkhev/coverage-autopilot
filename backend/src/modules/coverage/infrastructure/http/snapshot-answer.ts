import type {
  Snapshot,
  SnapshotSummary,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { RepositoryViewDto } from '#coverage/application/dto/repository-view.dto';

/** A snapshot as the coverage module gives it. */
type SnapshotView = NonNullable<RepositoryViewDto['latestSnapshot']>;

/** What the list of repositories shows of a snapshot. */
export function snapshotSummaryOf(snapshot: SnapshotView): SnapshotSummary {
  return {
    id: snapshot.id,
    commitSha: snapshot.commit.value,
    capturedAt: snapshot.capturedAt.toString(),
    totals: snapshot.totals,
    threshold: snapshot.threshold,
    files: snapshot.files,
  };
}

/**
 * A snapshot with the parameters it was measured with. The contract keeps
 * them in one object, and the module apart: what it detected in the
 * project, and how it measured.
 */
export function snapshotAnswerOf(snapshot: SnapshotView): Snapshot {
  const { project, parameters } = snapshot;
  return {
    ...snapshotSummaryOf(snapshot),
    repositoryId: snapshot.repositoryId.value,
    parameters: {
      testRunner: parameters.testRunner,
      testRunnerVersion: parameters.testRunnerVersion,
      coverageProvider: parameters.coverageProvider,
      packageManager: project.packageManager,
      configFile: project.configFile?.value ?? null,
      fileListRule: parameters.fileListRule,
    },
  };
}
