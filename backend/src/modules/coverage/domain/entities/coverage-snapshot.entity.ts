import { InvalidCoverageSnapshotError } from '#coverage/domain/errors/invalid-coverage-snapshot.error';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import type { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import type { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import type { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import type { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import type { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import type { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import { Entity } from '#kernel/primitives/entity';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';

export interface CoverageSnapshotProps {
  readonly id: SnapshotId;
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  /**
   * The scan job or the improvement that asked for the snapshot. Asked
   * again with the same key, the service finds this snapshot.
   */
  readonly originKey: string;
  readonly project: DetectedProject;
  readonly parameters: ScanParameters;
  /** Measured files and files of declarations alone. */
  readonly files: readonly FileCoverage[];
  readonly unmeasured: readonly UnmeasuredFile[];
  /** The raw output of the test run, which says why a file was dropped. */
  readonly testRunOutput: string | null;
  readonly capturedAt: Instant;
}

/** By code unit, so the order is the same under every locale. */
function byPath<Item extends { readonly path: FilePath }>(
  items: readonly Item[],
): Item[] {
  return [...items].sort(
    ({ path: left }, { path: right }) =>
      Number(left.value > right.value) - Number(left.value < right.value),
  );
}

function repeatedPath(props: CoverageSnapshotProps): string | undefined {
  const seen = new Set<string>();
  return [...props.files, ...props.unmeasured]
    .map((file) => file.path.value)
    .find((path) => seen.size === seen.add(path).size);
}

/**
 * The coverage of every eligible file of a repository at one commit. Each
 * file is in exactly one state, and the snapshot never changes after it
 * is created.
 */
export class CoverageSnapshot extends Entity<SnapshotId> {
  private readonly props: CoverageSnapshotProps;
  private readonly measuredTotals: CoverageCounters;

  private constructor(props: CoverageSnapshotProps) {
    super(props.id);
    this.props = Object.freeze({
      ...props,
      files: Object.freeze(byPath(props.files)),
      unmeasured: Object.freeze(byPath(props.unmeasured)),
    });
    this.measuredTotals = this.props.files
      .filter((file) => file.state === 'measured')
      .reduce((sum, file) => sum.plus(file.counters), CoverageCounters.none());
  }

  public static create(props: CoverageSnapshotProps): CoverageSnapshot {
    if (props.originKey.trim() === '') {
      throw new InvalidCoverageSnapshotError('A snapshot has an origin key.');
    }
    const repeated = repeatedPath(props);
    if (repeated !== undefined) {
      throw new InvalidCoverageSnapshotError(
        `${repeated} is in a snapshot twice, and a file has one state.`,
      );
    }
    return new CoverageSnapshot(props);
  }

  public get repositoryId(): RepositoryId {
    return this.props.repositoryId;
  }

  public get commit(): CommitSha {
    return this.props.commit;
  }

  public get originKey(): string {
    return this.props.originKey;
  }

  public get project(): DetectedProject {
    return this.props.project;
  }

  public get parameters(): ScanParameters {
    return this.props.parameters;
  }

  /** Sorted by path. */
  public get files(): readonly FileCoverage[] {
    return this.props.files;
  }

  /** Sorted by path. */
  public get unmeasured(): readonly UnmeasuredFile[] {
    return this.props.unmeasured;
  }

  public get testRunOutput(): string | null {
    return this.props.testRunOutput;
  }

  public get capturedAt(): Instant {
    return this.props.capturedAt;
  }

  /** Over measured files only: an unmeasured file has no numbers to add. */
  public get totals(): CoverageCounters {
    return this.measuredTotals;
  }

  public fileAt(path: FilePath): FileCoverage | UnmeasuredFile | null {
    const same = (file: { readonly path: FilePath }): boolean =>
      file.path.equals(path);
    return this.files.find(same) ?? this.unmeasured.find(same) ?? null;
  }

  /** The files that can be improved, sorted by path. */
  public targets(threshold: CoverageThreshold): FileCoverage[] {
    return this.files.filter((file) => file.canBeTarget(threshold));
  }
}
